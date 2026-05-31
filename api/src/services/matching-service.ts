/**
 * Auto-matching service
 *
 * Two entry points, both fire-and-forget:
 *   triggerJobMatching      — called when a job brief is posted or edited.
 *                             Finds all eligible candidates with overlapping skills.
 *   triggerCandidateMatching — called when a candidate profile is saved and
 *                             becomes matching-eligible. Finds all active jobs
 *                             with overlapping skills.
 *
 * Both share the same pipeline run + save logic via runAndSavePair().
 * The NOT EXISTS guard in each query ensures a given candidate+job pair is
 * only ever matched once — edits and profile updates reach only previously
 * unmatched pairs.
 */

import type { FastifyInstance } from 'fastify';
import { withTransaction } from '../db/index.ts';
import { config } from '../config/index.ts';

// ── Sequential queue ─────────────────────────────────────────────────────────
// All auto-matching runs are chained onto a single promise so they execute
// one at a time.  This bounds DB connection usage to ~3 connections regardless
// of how many jobs are posted or candidates register concurrently, preventing
// the pool from being exhausted while normal API calls are in flight.
let _autoMatchQueue: Promise<void> = Promise.resolve();

// ── Shared pipeline resource loader ──────────────────────────────────────────

async function loadResources(app: FastifyInstance) {
  const [
    { runPipeline },
    { buildContext },
    { getOntology },
  ] = await Promise.all([
    import('../../../reference-impl/matching-engine/pipeline.ts'),
    import('../../../reference-impl/matching-engine/context.ts'),
    import('../../../reference-impl/ontology/loader.ts'),
  ]);

  const metricsRows = await app.db`
    SELECT cohort_stats FROM analytical.fairness_metrics
    WHERE scope_level = 'platform' AND cohort_stats IS NOT NULL
    ORDER BY computed_at DESC LIMIT 1
  `;
  const cohortMetricsMap: Record<string, any> = (metricsRows[0] as any)?.cohort_stats ?? {};

  return { runPipeline, buildContext, ontology: getOntology(), cohortMetricsMap };
}

// ── Core pair runner ─────────────────────────────────────────────────────────

async function runAndSavePair(
  app: FastifyInstance,
  candidateRow: any,
  jobRow: any,
  resources: Awaited<ReturnType<typeof loadResources>>,
): Promise<string> {
  const { runPipeline, buildContext, ontology, cohortMetricsMap } = resources;
  const candidateId = candidateRow.candidate_id as string;
  const jobId       = jobRow.job_id       as string;
  const companyId   = jobRow.company_id   as string;
  const jobTitle    = jobRow.title        as string;
  const slaDays     = (jobRow.response_sla_days as number) ?? 10;

  const cohortRows = await app.db`
    SELECT cohort_id, characteristic FROM matching.candidate_cohorts
    WHERE candidate_id = ${candidateId}
  `;
  const candidateCohorts = (cohortRows as any[]).map(r => ({
    characteristic: r.characteristic as string,
    cohortId:       r.cohort_id      as string,
  }));

  const ctx = buildContext(
    ontology,
    {
      getForCohort:  (id: string):  any   => cohortMetricsMap[id] ?? null,
      getForJob:     (_id: string): any[] => [],
      getForCompany: (_id: string): any[] => [],
    } as any,
    { async getCohorts(id: string) { return id === candidateId ? candidateCohorts : []; } } as any,
  );

  const result   = await runPipeline(mapCandidateProfile(candidateRow) as any, mapJobBrief(jobRow) as any, ctx);
  const decision = result.candidateExplanation.outcome.decision;

  await withTransaction(app.db, { candidateId }, async (tx) => {
    const matchEvent = result.governanceExplanation;

    await tx`
      INSERT INTO matching.match_events (
        match_id, candidate_id, job_id, company_id, fhp_version, pipeline_version,
        decision, overall_score, pre_correction_score, skill_score,
        transferable_skill_score, preference_alignment_score,
        bias_correction_delta, bias_correction_triggered, qualified
      ) VALUES (
        ${result.matchId}, ${candidateId}, ${jobId},
        ${companyId}, '1.0.0', '1.0.0',
        ${matchEvent.outcome.decision},
        ${matchEvent.outcome.overall_score},
        ${matchEvent.outcome.pre_correction_score ?? matchEvent.outcome.overall_score},
        ${matchEvent.scores.skill_score},
        ${matchEvent.scores.transferable_skill_score},
        ${matchEvent.scores.preference_alignment_score},
        ${matchEvent.scores.bias_correction_delta},
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
          ${expl.explanation_id}, ${result.matchId}, ${candidateId}, ${jobId},
          ${expl.audience},
          ${expl.plain_language_summary ?? ''},
          ${app.db.json(expl.skill_breakdown as any)},
          ${app.db.json(expl.scores as any)},
          ${app.db.json(expl.bias_assessment as any)},
          ${app.db.json((expl.outcome.not_matched_reasons ?? []) as any)},
          ${app.db.json((expl.next_steps ?? []) as any)}
        )
      `;
    }

    const trace = result.trace as any;
    await tx`
      INSERT INTO analytical.pipeline_traces (
        trace_id, match_id, candidate_id, job_id, fhp_version, pipeline_version,
        started_at, completed_at, duration_ms, status, trace_data, checksum
      ) VALUES (
        ${trace.trace_id}, ${result.matchId}, ${candidateId}, ${jobId},
        '1.0.0', '1.0.0', ${trace.started_at}, ${trace.completed_at},
        ${trace.duration_ms ?? 0}, ${trace.status},
        ${app.db.json(trace)}, ${trace.checksum}
      )
    `;

    if (decision === 'matched') {
      await tx`
        INSERT INTO matching.active_interactions (
          match_id, candidate_id, company_id, job_id,
          current_stage, sla_deadline
        ) VALUES (
          ${result.matchId}, ${candidateId}, ${companyId}, ${jobId},
          'initial_match_acknowledgement',
          NOW() + (${slaDays}::smallint * INTERVAL '1 day')
        )
      `;
      await tx`
        INSERT INTO matching.candidate_notifications (
          candidate_id, notification_type, title, body,
          match_id, job_id, company_id, actions
        ) VALUES (
          ${candidateId}, 'stage_invitation',
          ${'Interview process started: ' + jobTitle},
          'The employer has acknowledged your match and opened the hiring process. Check your interactions.',
          ${result.matchId}, ${jobId}, ${companyId}, '[]'::jsonb
        )
      `;
    }

    if (decision === 'matched' || decision === 'borderline') {
      const notifTitle = decision === 'matched' ? `Matched: ${jobTitle}` : `Borderline match: ${jobTitle}`;
      const notifBody  = decision === 'matched'
        ? 'Great news — your profile matched this role. Check the details below.'
        : 'Your profile is a borderline match for this role. You can appeal this decision.';
      await tx`
        INSERT INTO matching.candidate_notifications (
          candidate_id, notification_type, title, body,
          match_id, job_id, company_id, actions
        ) VALUES (
          ${candidateId}, 'match_result', ${notifTitle}, ${notifBody},
          ${result.matchId}, ${jobId}, ${companyId}, '[]'::jsonb
        )
      `;
    }
  });

  return decision;
}

// ── Public entry points ───────────────────────────────────────────────────────

/**
 * Run matching for all eligible candidates against a specific job.
 * Called fire-and-forget when a job brief is created or edited.
 */
export function triggerJobMatching(
  app: FastifyInstance,
  jobId: string,
  companyId: string,
): void {
  if (!config.autoMatchingEnabled) return;
  _autoMatchQueue = _autoMatchQueue
    .then(() => _triggerJobMatching(app, jobId, companyId))
    .catch((err: unknown) => { try { app.log.error({ err, jobId }, 'Auto-match (job) failed'); } catch { /* swallow */ } });
}

async function _triggerJobMatching(
  app: FastifyInstance,
  jobId: string,
  companyId: string,
): Promise<void> {
  const log = app.log.child({ service: 'auto-match', trigger: 'job', jobId });

  const jobRows = await app.db`
    SELECT * FROM matching.job_briefs WHERE job_id = ${jobId} AND status = 'active' LIMIT 1
  `;
  if (!jobRows[0]) { log.warn('Job not found or not active'); return; }
  const jobRow = jobRows[0] as any;

  const skillIds = (jobRow.skills_required ?? []).map((s: any) => s.ontology_id as string);
  if (!skillIds.length) { log.warn('Job has no skills_required'); return; }

  // Candidates with any existing match record for this job are excluded regardless
  // of decision. Edits only reach previously unmatched candidates — existing results
  // are never silently superseded. Use the appeal mechanism if an edit was material.
  // Process up to 5 most recently registered eligible candidates per job posting.
  // A scheduled sweep covers candidates outside this window.
  const candidates = await app.db`
    SELECT cp.* FROM matching.candidate_profiles cp
    WHERE cp.matching_eligible = true
      AND NOT EXISTS (
        SELECT 1 FROM matching.match_events me
        WHERE me.candidate_id = cp.candidate_id AND me.job_id = ${jobId}
      )
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(cp.skills) s
        WHERE (s->>'ontology_id') = ANY(${skillIds})
      )
    ORDER BY cp.created_at DESC
    LIMIT 5
  `;

  if (!candidates.length) { log.info('No eligible candidates with overlapping skills'); return; }
  log.info({ candidateCount: candidates.length }, 'Starting pipeline runs');

  const resources = await loadResources(app);

  // Run all candidate pairs for this job in parallel to drain the queue faster.
  // Each pair holds one DB connection for its transaction; with LIMIT 5 and a
  // pool of 10, at most 5 connections are occupied simultaneously.
  const results = await Promise.allSettled(
    (candidates as any[]).map(row => runAndSavePair(app, row, jobRow, resources)),
  );
  let matched = 0, borderline = 0, notMatched = 0, errors = 0;
  for (const r of results) {
    if (r.status === 'rejected') { errors++; log.error({ err: r.reason }, 'Pipeline error — skipping'); }
    else if (r.value === 'matched') matched++;
    else if (r.value === 'borderline') borderline++;
    else notMatched++;
  }

  log.info({ matched, borderline, notMatched, errors }, 'Auto-match complete');
}

/**
 * Run matching for a specific candidate against all active job briefs.
 * Called fire-and-forget when a candidate profile is saved and becomes eligible.
 */
export function triggerCandidateMatching(
  app: FastifyInstance,
  candidateId: string,
): void {
  if (!config.autoMatchingEnabled) return;
  _autoMatchQueue = _autoMatchQueue
    .then(() => _triggerCandidateMatching(app, candidateId))
    .catch((err: unknown) => { try { app.log.error({ err, candidateId }, 'Auto-match (candidate) failed'); } catch { /* swallow */ } });
}

// ── Exported for test-helper endpoints (synchronous, awaited) ────────────────
export { _triggerJobMatching as runJobMatchingSync, _triggerCandidateMatching as runCandidateMatchingSync };

async function _triggerCandidateMatching(
  app: FastifyInstance,
  candidateId: string,
): Promise<void> {
  const log = app.log.child({ service: 'auto-match', trigger: 'candidate', candidateId });

  const candidateRows = await app.db`
    SELECT * FROM matching.candidate_profiles
    WHERE candidate_id = ${candidateId} AND matching_eligible = true AND status != 'deleted'
    LIMIT 1
  `;
  if (!candidateRows[0]) { log.warn('Candidate not found or not eligible'); return; }
  const candidateRow = candidateRows[0] as any;

  const candidateSkillIds = (candidateRow.skills ?? []).map((s: any) => s.ontology_id as string);
  if (!candidateSkillIds.length) { log.warn('Candidate has no skills'); return; }

  // Same exclusion principle as triggerJobMatching: skip jobs already matched.
  // Restricted to the 3 most recently activated jobs with overlapping skills;
  // a scheduled sweep handles older active briefs.
  const jobs = await app.db`
    SELECT jb.* FROM matching.job_briefs jb
    WHERE jb.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM matching.match_events me
        WHERE me.candidate_id = ${candidateId} AND me.job_id = jb.job_id
      )
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(jb.skills_required) s
        WHERE (s->>'ontology_id') = ANY(${candidateSkillIds})
      )
    ORDER BY jb.activated_at DESC
    LIMIT 3
  `;

  if (!jobs.length) { log.info('No active jobs with overlapping skills'); return; }
  log.info({ jobCount: jobs.length }, 'Starting pipeline runs');

  const resources = await loadResources(app);

  // Run all job pairs for this candidate in parallel (see triggerJobMatching comment).
  const results = await Promise.allSettled(
    (jobs as any[]).map(jobRow => runAndSavePair(app, candidateRow, jobRow, resources)),
  );
  let matched = 0, borderline = 0, notMatched = 0, errors = 0;
  for (const r of results) {
    if (r.status === 'rejected') { errors++; log.error({ err: r.reason }, 'Pipeline error — skipping'); }
    else if (r.value === 'matched') matched++;
    else if (r.value === 'borderline') borderline++;
    else notMatched++;
  }

  log.info({ matched, borderline, notMatched, errors }, 'Auto-match complete');
}

// ── DB → Pipeline type mappers ────────────────────────────────────────────────
// Mirrors the mappers in routes/matches.ts — kept in sync manually.

function mapCandidateProfile(row: any) {
  const prefs = row.preferences ?? {};
  return {
    fhp_version:  row.fhp_version ?? '1.0.0',
    candidate_id: row.candidate_id,
    created_at:   String(row.created_at),
    updated_at:   row.updated_at ? String(row.updated_at) : undefined,
    skills: (row.skills ?? []).map((s: any) => ({
      ontology_id:         s.ontology_id,
      proficiency:         s.proficiency,
      years_of_experience: s.years_of_experience ?? s.years_experience,
      evidence: s.evidence_url
        ? [{ type: 'url', value: s.evidence_url }]
        : (s.evidence ?? undefined),
    })),
    work_history: row.work_history,
    preferences: {
      work_modes:       prefs.work_modes ?? prefs.work_mode,
      locations:        prefs.locations ?? prefs.location_countries,
      employment_types: prefs.employment_types ?? prefs.employment_type,
      salary: prefs.salary?.minimum != null
        ? prefs.salary
        : (prefs.salary_minimum ?? prefs.salary_min) != null
          ? {
              currency: prefs.salary_currency ?? 'GBP',
              minimum:  Number(prefs.salary_minimum ?? prefs.salary_min),
              period:   (prefs.salary_period ?? 'annual') as 'annual' | 'daily' | 'hourly',
            }
          : undefined,
      notice_period_days: prefs.notice_period_days,
      open_to_relocation: prefs.open_to_relocation,
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
    skills_required: (row.skills_required ?? []).map((s: any) => ({
      ontology_id:         s.ontology_id,
      requirement_level:   s.requirement_level   ?? s.requirement_type,
      minimum_proficiency: s.minimum_proficiency ?? s.min_proficiency,
      context:             s.context,
    })),
    salary: {
      currency: row.salary_currency,
      minimum:  Number(row.salary_minimum),
      maximum:  Number(row.salary_maximum),
      period:   row.salary_period ?? 'annual',
    },
    work_mode: row.work_mode,
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
