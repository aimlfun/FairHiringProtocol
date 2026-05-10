import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCompany, requireCandidate, requireGovernance } from '../middleware/auth.ts';
import {
  NotFoundError, ValidationError, ConflictError,
  JobBriefNotActiveError, CompanyNotActiveError, AppealWindowExpiredError,
  DuplicateAppealError
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
      throw new ValidationError(
        'Your profile is not yet eligible for matching. ' +
        'Ensure you have confirmed your age and added at least one skill.'
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

    const candidateProfile = await app.db`
      SELECT * FROM matching.candidate_profiles WHERE candidate_id = ${candidateId}
    `;
    const jobBrief = await app.db`
      SELECT * FROM matching.job_briefs WHERE job_id = ${job_id}
    `;

    const ctx    = buildContext(getOntology(), new StubFairnessMetricsStore(), new StubCohortService());
    const result = await runPipeline(candidateProfile[0] as any, jobBrief[0] as any, ctx);

    // Persist match event and explanations
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
          ${jobBrief[0]!.company_id as string}, '1.0.0', '1.0.0',
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
          ${JSON.stringify(trace)}::jsonb, ${trace.checksum}
        )
      `;
    });

    return reply.status(201).send({
      match_id:  result.matchId,
      decision:  result.candidateExplanation.outcome.decision,
      score:     result.candidateExplanation.outcome.overall_score,
      explanation: result.candidateExplanation,
    });
  });
}
