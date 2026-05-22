import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCompany, requireCandidate, requireGovernance } from '../middleware/auth.ts';
import {
  NotFoundError, ValidationError, ConflictError,
  JobBriefNotActiveError, CompanyNotActiveError, AppealWindowExpiredError,
  DuplicateAppealError, MatchingIneligibleError
} from '../errors/index.ts';

export async function matchRoutes(app: FastifyInstance): Promise<void> {

  /**
   * POST /v1/matches
   * Trigger a pipeline run for a candidate-job pair.
   * In the reference impl, this runs the pipeline in-process.
   * In production, this would enqueue a job and return a match_id immediately.
   */
  app.post('/', {
    preHandler: [requireCandidate],
    schema: {
      tags: ['matches'], summary: 'Trigger a match pipeline run', security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['job_id'],
        properties: { job_id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;
    const { job_id }  = request.body as { job_id: string };

    // Verify candidate is eligible
    const candidate = await app.db`
      SELECT matching_eligible, status FROM matching.candidate_profiles
      WHERE candidate_id = ${candidateId} LIMIT 1
    `;
    if (!candidate[0] || !candidate[0].matching_eligible) {
      throw new MatchingIneligibleError(
        'profile not eligible — confirm your age and add at least one skill'
      );
    }

    // Verify job is active
    const job = await app.db`
      SELECT job_id, status FROM matching.job_briefs
      WHERE job_id = ${job_id} AND status = 'active' LIMIT 1
    `;
    if (!job[0]) throw new JobBriefNotActiveError();

    // Check for duplicate match (same candidate + job within last 24h)
    const recentMatch = await app.db`
      SELECT match_id FROM matching.match_events
      WHERE candidate_id = ${candidateId} AND job_id = ${job_id}
        AND created_at > NOW() - INTERVAL '24 hours'
      LIMIT 1
    `;
    if (recentMatch[0]) {
      throw new ConflictError(
        'A match for this job was already run within the last 24 hours. ' +
        `match_id: ${recentMatch[0].match_id}`
      );
    }

    // Run pipeline in-process (reference impl)
    // In production: enqueue to job queue and return 202 Accepted
    const { runPipeline }    = await import('../../../reference-impl/matching-engine/pipeline.ts');
    const { buildContext }   = await import('../../../reference-impl/matching-engine/context.ts');
    const { getOntology }    = await import('../../../reference-impl/ontology/loader.ts');
    const { StubCohortService }         = await import('../../../reference-impl/bias/cohort.ts');
    const { StubFairnessMetricsStore }  = await import('../../../reference-impl/fairness/store.ts');

    const candidateRow = await app.db`
      SELECT * FROM matching.candidate_profiles WHERE candidate_id = ${candidateId}
    `;
    const jobRow = await app.db`
      SELECT * FROM matching.job_briefs WHERE job_id = ${job_id}
    `;

    // Map DB rows to the pipeline's canonical type shapes.
    // The DB stores flat columns (salary_currency, location_country) and uses
    // different JSONB field names (requirement_type / min_proficiency) from
    // what the reference implementation expects (requirement_level / minimum_proficiency).
    const mappedCandidate = mapCandidateProfile(candidateRow[0]);
    const mappedJob       = mapJobBrief(jobRow[0]);

    const ctx    = buildContext(getOntology(), new StubFairnessMetricsStore(), new StubCohortService());
    const result = await runPipeline(mappedCandidate as any, mappedJob as any, ctx);

    const decision   = result.candidateExplanation.outcome.decision;
    const companyId  = jobRow[0]!.company_id as string;
    const jobTitle   = jobRow[0]!.title as string;

    // Persist match event, explanations, trace, and notification atomically
    await app.db.begin(async (tx) => {
      const matchEvent = result.governanceExplanation;
      await tx`
        INSERT INTO matching.match_events (
          match_id, candidate_id, job_id, company_id, fhp_version, pipeline_version,
          decision, overall_score, pre_correction_score, skill_score,
          transferable_skill_score, preference_alignment_score,
          bias_correction_delta, bias_correction_triggered, qualified
        ) VALUES (
          ${result.matchId}, ${candidateId}, ${job_id},
          ${companyId}, '1.0.0', '1.0.0',
          ${matchEvent.outcome.decision},
          ${matchEvent.outcome.overall_score}, ${matchEvent.outcome.pre_correction_score ?? matchEvent.outcome.overall_score},
          ${matchEvent.scores.skill_score}, ${matchEvent.scores.transferable_skill_score},
          ${matchEvent.scores.preference_alignment_score}, ${matchEvent.scores.bias_correction_delta},
          ${matchEvent.bias_assessment.triggered},
          ${matchEvent.outcome.decision !== 'not_matched'}
        )
      `;

      for (const expl of [result.candidateExplanation, result.employerExplanation, result.governanceExplanation]) {
        await tx`
          INSERT INTO matching.match_explanations (
            explanation_id, match_id, candidate_id, job_id, audience,
            plain_language_summary, skill_breakdown, scores_snapshot,
            bias_assessment, not_matched_reasons, next_steps
          ) VALUES (
            ${expl.explanation_id}, ${result.matchId}, ${candidateId}, ${job_id},
            ${expl.audience},
            ${expl.plain_language_summary ?? ''},
            ${JSON.stringify(expl.skill_breakdown)}::jsonb,
            ${JSON.stringify(expl.scores)}::jsonb,
            ${JSON.stringify(expl.bias_assessment)}::jsonb,
            ${JSON.stringify(expl.outcome.not_matched_reasons ?? [])}::jsonb,
            ${JSON.stringify(expl.next_steps ?? [])}::jsonb
          )
        `;
      }

      // Write immutable trace
      const trace = result.trace as any;
      await tx`
        INSERT INTO analytical.pipeline_traces (
          trace_id, match_id, candidate_id, job_id, fhp_version, pipeline_version,
          started_at, completed_at, duration_ms, status, trace_data, checksum
        ) VALUES (
          ${trace.trace_id}, ${result.matchId}, ${candidateId}, ${job_id},
          '1.0.0', '1.0.0', ${trace.started_at}, ${trace.completed_at},
          ${trace.duration_ms ?? 0}, ${trace.status},
          ${app.db.json(trace)}, ${trace.checksum}
        )
      `;

      // Notify candidate for matched and borderline decisions only.
      // not_matched decisions are silent per FHP protocol §7.2.
      if (decision === 'matched' || decision === 'borderline') {
        const notifTitle = decision === 'matched'
          ? `Matched: ${jobTitle}`
          : `Borderline match: ${jobTitle}`;
        const notifBody = decision === 'matched'
          ? 'Great news — your profile matched this role. Check the details below.'
          : 'Your profile is a borderline match for this role. You can appeal this decision.';
        await tx`
          INSERT INTO matching.candidate_notifications (
            candidate_id, notification_type, title, body,
            match_id, job_id, company_id, actions
          ) VALUES (
            ${candidateId}, 'match_result', ${notifTitle}, ${notifBody},
            ${result.matchId}, ${job_id}, ${companyId}, '[]'::jsonb
          )
        `;
      }
    });

    return reply.status(201).send({
      match_id:  result.matchId,
      decision:  result.candidateExplanation.outcome.decision,
      score:     result.candidateExplanation.outcome.overall_score,
      explanation: result.candidateExplanation,
    });
  });
}

// ── DB → Pipeline type mappers ───────────────────────────────────────────────
// The DB stores flat columns and uses API-friendly field names that differ
// from the reference implementation's canonical schema.  These functions
// bridge the gap so the pipeline always receives correctly-shaped objects.

function mapCandidateProfile(row: any) {
  const prefs = row.preferences ?? {};
  return {
    fhp_version:  row.fhp_version ?? '1.0.0',
    candidate_id: row.candidate_id,
    created_at:   String(row.created_at),
    updated_at:   row.updated_at ? String(row.updated_at) : undefined,
    skills: (row.skills ?? []).map((s: any) => ({
      ontology_id:          s.ontology_id,
      proficiency:          s.proficiency,
      years_of_experience:  s.years_of_experience ?? s.years_experience,
      evidence: s.evidence_url
        ? [{ type: 'url', value: s.evidence_url }]
        : (s.evidence ?? undefined),
    })),
    work_history: row.work_history,
    preferences: {
      // DB stores work_mode (array key), pipeline expects work_modes
      work_modes:       prefs.work_modes ?? prefs.work_mode,
      // DB stores location_countries, pipeline expects locations
      locations:        prefs.locations ?? prefs.location_countries,
      // DB stores employment_type (array), pipeline expects employment_types
      employment_types: prefs.employment_types ?? prefs.employment_type,
      // DB stores salary_min + salary_currency flat; pipeline expects nested salary object
      salary: prefs.salary?.minimum != null
        ? prefs.salary
        : prefs.salary_min != null
          ? {
              currency: prefs.salary_currency ?? 'GBP',
              minimum:  Number(prefs.salary_min),
              period:   'annual' as const,
            }
          : undefined,
      notice_period_days:  prefs.notice_period_days,
      open_to_relocation:  prefs.open_to_relocation,
    },
    privacy: row.privacy,
  };
}

function mapJobBrief(row: any) {
  return {
    fhp_version:  row.fhp_version ?? '1.0.0',
    job_id:       row.job_id,
    company_id:   row.company_id,
    created_at:   String(row.created_at),
    updated_at:   row.updated_at ? String(row.updated_at) : undefined,
    expires_at:   row.expires_at ? String(row.expires_at) : undefined,
    status:       row.status,
    title:        row.title,
    role_summary: row.role_summary,
    // DB stores requirement_type / min_proficiency; pipeline uses requirement_level / minimum_proficiency
    skills_required: (row.skills_required ?? []).map((s: any) => ({
      ontology_id:         s.ontology_id,
      requirement_level:   s.requirement_level   ?? s.requirement_type,
      minimum_proficiency: s.minimum_proficiency ?? s.min_proficiency,
      context:             s.context,
    })),
    // DB stores flat salary columns; pipeline expects a nested salary object
    salary: {
      currency: row.salary_currency,
      minimum:  Number(row.salary_minimum),
      maximum:  Number(row.salary_maximum),
      period:   row.salary_period ?? 'annual',
    },
    work_mode: row.work_mode,
    // DB stores flat location columns; pipeline expects a nested location object
    location: {
      country: row.location_country,
      region:  row.location_region,
      city:    row.location_city,
    },
    employment_type: row.employment_type,
    process: row.process_stages
      ? { stages: row.process_stages, response_sla_days: row.response_sla_days }
      : undefined,
  };
}
