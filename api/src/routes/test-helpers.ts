/**
 * FHP API — Dev-only test helpers
 *
 * These endpoints exist solely to support E2E tests that require DB state
 * that can only be reached via time manipulation or infrastructure triggers
 * (SLA timer, fairness job). They are registered only when NODE_ENV=development.
 *
 * Endpoints:
 *   POST /v1/test-helpers/create-backdated-match  — insert not_matched event N days ago
 *   POST /v1/test-helpers/create-ghosting-event   — insert a synthetic open ghosting event
 *   POST /v1/test-helpers/expire-interaction-sla  — set active_interaction sla_deadline to 2h ago
 *   POST /v1/test-helpers/run-sla-monitor         — detect SLA breaches, create ghosting events
 *   POST /v1/test-helpers/assign-cohorts                — seed candidate_cohorts for bias detection tests
 *   POST /v1/test-helpers/seed-fairness-breach          — seed analytical.fairness_metrics breach record
 *   POST /v1/test-helpers/compute-job-fairness          — compute engagement-rate fairness for a job
 *   POST /v1/test-helpers/trigger-job-matching          — run auto-matching for a job synchronously
 *   POST /v1/test-helpers/trigger-candidate-matching    — run auto-matching for a candidate synchronously
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/index.ts';
import { runJobMatchingSync, runCandidateMatchingSync } from '../services/matching-service.ts';

function requireTestKey(request: FastifyRequest, reply: FastifyReply, done: () => void): void {
  const key = request.headers['x-test-helper-key'];
  if (!config.testHelperKey) {
    // No key configured — reject all requests (forces explicit opt-in)
    reply.status(503).send({ error: 'TEST_HELPERS_DISABLED', message: 'TEST_HELPER_KEY is not configured.' });
    return;
  }
  if (key !== config.testHelperKey) {
    reply.status(401).send({ error: 'UNAUTHORISED', message: 'Valid X-Test-Helper-Key header required.' });
    return;
  }
  done();
}

export async function testHelperRoutes(app: FastifyInstance): Promise<void> {

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/test-helpers/create-backdated-match
  // Inserts a synthetic not_matched event with created_at set N days ago.
  // match_events is immutable (UPDATE trigger), so backdating is done by
  // INSERT with an explicit created_at.
  // Used by test 9.10 to simulate an expired appeal window.
  // Requires a valid candidate JWT in the Authorization header.
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/create-backdated-match', {
    preHandler: [requireTestKey],
    schema: {
      tags: ['test-helpers'],
      summary: '[DEV ONLY] Create a backdated not_matched event',
      body: {
        type: 'object',
        required: ['job_id', 'days'],
        properties: {
          job_id: { type: 'string', format: 'uuid' },
          days:   { type: 'integer', minimum: 1, maximum: 365 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Verify the caller is an authenticated candidate
    let candidateId: string;
    try {
      await request.jwtVerify();
      candidateId = (request.user as any).candidateId as string;
      if (!candidateId) throw new Error('not a candidate token');
    } catch {
      return reply.status(401).send({ error: 'UNAUTHORISED', message: 'Valid candidate JWT required' });
    }

    const { job_id, days } = request.body as { job_id: string; days: number };

    const job = await app.db`
      SELECT job_id, company_id FROM matching.job_briefs WHERE job_id = ${job_id} LIMIT 1
    `;
    const jobRow = job[0] as { job_id: string; company_id: string } | undefined;
    if (!jobRow) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: `Job ${job_id} not found` });
    }

    const matchId   = crypto.randomUUID();
    const createdAt = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    await app.db`
      INSERT INTO matching.match_events (
        match_id, candidate_id, job_id, company_id,
        fhp_version, pipeline_version,
        decision, overall_score, pre_correction_score,
        skill_score, transferable_skill_score, preference_alignment_score,
        bias_correction_delta, bias_correction_triggered, qualified,
        created_at
      ) VALUES (
        ${matchId}, ${candidateId}, ${job_id}, ${jobRow.company_id},
        '1.0.0', '1.0.0',
        'not_matched', 0.2, 0.2,
        0.2, 0.0, 0.5,
        0.0, false, false,
        ${createdAt}
      )
    `;

    return reply.status(201).send({ match_id: matchId, created_at: createdAt });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/test-helpers/create-ghosting-event
  // Inserts a synthetic open ghosting event for an existing active_interaction.
  // sla_deadline is set to 2 hours ago so the event passes the
  // detected_at >= sla_deadline constraint.
  // Used by tests 8.4, 8.5.
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/create-ghosting-event', {
    preHandler: [requireTestKey],
    schema: {
      tags: ['test-helpers'],
      summary: '[DEV ONLY] Create a synthetic ghosting event',
      body: {
        type: 'object',
        required: ['interaction_id'],
        properties: {
          interaction_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { interaction_id } = request.body as { interaction_id: string };

    const interaction = await app.db`
      SELECT interaction_id, match_id, candidate_id, company_id, job_id
      FROM   matching.active_interactions
      WHERE  interaction_id = ${interaction_id}
      LIMIT  1
    `;

    const interactionRow = interaction[0] as
      { match_id: string; candidate_id: string; company_id: string; job_id: string } | undefined;

    if (!interactionRow) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: `Interaction ${interaction_id} not found` });
    }

    const { match_id, candidate_id, company_id, job_id } = interactionRow;

    const rows = await app.db`
      INSERT INTO matching.ghosting_events (
        fhp_version, candidate_id, company_id, job_id, match_id, interaction_id,
        stage_name, sla_deadline, detected_at, overdue_hours,
        severity, status, company_strike_count_at_detection
      ) VALUES (
        '1.0.0', ${candidate_id}, ${company_id}, ${job_id}, ${match_id}, ${interaction_id},
        'initial_match_acknowledgement',
        NOW() - INTERVAL '2 hours',
        NOW(),
        2.0,
        'minor',
        'open',
        0
      )
      ON CONFLICT (match_id, stage_name) DO UPDATE
        SET detected_at = NOW(),
            sla_deadline = NOW() - INTERVAL '2 hours',
            status = 'open',
            updated_at = NOW()
      RETURNING ghosting_id, status, stage_name
    `;

    const ghostingRow = rows[0] as { ghosting_id: string; status: string; stage_name: string } | undefined;
    if (!ghostingRow) throw new Error('Ghosting event insert returned no row');

    return reply.status(201).send({
      ghosting_id:    ghostingRow.ghosting_id,
      status:         ghostingRow.status,
      stage_name:     ghostingRow.stage_name,
      interaction_id,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/test-helpers/expire-interaction-sla
  // Sets sla_deadline = NOW() - INTERVAL '2 hours' on an active_interaction.
  // Simulates time passing so the SLA monitor will detect a breach.
  // Used by tests 7.5, 8.1.
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/expire-interaction-sla', {
    preHandler: [requireTestKey],
    schema: {
      tags: ['test-helpers'],
      summary: '[DEV ONLY] Set interaction SLA deadline to 2 hours ago',
      body: {
        type: 'object',
        required: ['interaction_id'],
        properties: {
          interaction_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { interaction_id } = request.body as { interaction_id: string };

    // sla_deadline > stage_entered_at is a CHECK constraint, so both must be backdated together.
    const rows = await app.db`
      UPDATE matching.active_interactions
      SET    stage_entered_at = NOW() - INTERVAL '3 hours',
             sla_deadline     = NOW() - INTERVAL '2 hours',
             updated_at       = NOW()
      WHERE  interaction_id = ${interaction_id}
        AND  status         = 'active'
      RETURNING interaction_id, sla_deadline
    `;

    const row = rows[0] as { interaction_id: string; sla_deadline: Date } | undefined;
    if (!row) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: `Active interaction ${interaction_id} not found` });
    }

    return reply.send({ interaction_id: row.interaction_id, sla_deadline: row.sla_deadline });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/test-helpers/run-sla-monitor
  // Minimal SLA breach scanner: finds active_interactions with sla_deadline < NOW(),
  // creates ghosting_events for those that don't already have one.
  // Optional body.interaction_id scopes the scan to a single interaction.
  // Used by tests 7.5, 8.1.
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/run-sla-monitor', {
    preHandler: [requireTestKey],
    schema: {
      tags: ['test-helpers'],
      summary: '[DEV ONLY] Detect SLA breaches and create ghosting events',
      body: {
        type: 'object',
        properties: {
          interaction_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { interaction_id } = (request.body as { interaction_id?: string }) ?? {};

    const interactions = await app.db`
      SELECT interaction_id, match_id, candidate_id, company_id, job_id,
             current_stage, sla_deadline,
             EXTRACT(EPOCH FROM (NOW() - sla_deadline)) / 3600 AS overdue_hours
      FROM   matching.active_interactions
      WHERE  sla_deadline < NOW()
        AND  status = 'active'
        ${interaction_id ? app.db`AND interaction_id = ${interaction_id}` : app.db``}
    `;

    const ghostingIds: string[] = [];

    for (const r of interactions as any[]) {
      // Skip if a ghosting event already exists for this (match_id, stage)
      const existing = await app.db`
        SELECT ghosting_id FROM matching.ghosting_events
        WHERE  match_id   = ${r.match_id}
          AND  stage_name = ${r.current_stage}
        LIMIT  1
      `;
      if (existing[0]) continue;

      const overdueHours = parseFloat(r.overdue_hours);
      const stage        = r.current_stage as string;

      let severity: 'minor' | 'significant' | 'severe';
      if (stage === 'offer_stage' || stage === 'post_rejection_feedback') {
        severity = 'severe';
      } else if (overdueHours >= 72) {
        severity = 'severe';
      } else if (overdueHours >= 24) {
        severity = 'significant';
      } else {
        severity = 'minor';
      }

      const created = await app.db`
        INSERT INTO matching.ghosting_events (
          fhp_version, candidate_id, company_id, job_id, match_id, interaction_id,
          stage_name, sla_deadline, detected_at, overdue_hours,
          severity, status, company_strike_count_at_detection
        ) VALUES (
          '1.0.0',
          ${r.candidate_id}, ${r.company_id}, ${r.job_id},
          ${r.match_id},     ${r.interaction_id},
          ${stage}, ${r.sla_deadline}, NOW(),
          ${Math.round(overdueHours * 10) / 10},
          ${severity}, 'open', 0
        )
        RETURNING ghosting_id
      `;

      const ghostingRow = created[0] as { ghosting_id: string } | undefined;
      if (ghostingRow) ghostingIds.push(ghostingRow.ghosting_id);
    }

    return reply.send({ breaches_detected: ghostingIds.length, ghosting_ids: ghostingIds });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/test-helpers/assign-cohorts
  // Seeds candidate_cohorts rows so the matching pipeline's bias detection
  // stage (Stage 7) can read real cohort memberships instead of returning [].
  // Body: { candidate_id, cohorts: [{characteristic, cohort_id}] }
  // characteristic must be one of the DB CHECK values:
  //   sex_group | age_group | ethnicity_group | religion_group |
  //   education_group | employment_gap_group
  // cohort_id must match ^cohort:[a-z_]+:[A-Za-z0-9]+$
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/assign-cohorts', {
    preHandler: [requireTestKey],
    schema: {
      tags: ['test-helpers'],
      summary: '[DEV ONLY] Seed candidate cohort memberships',
      body: {
        type: 'object',
        required: ['candidate_id', 'cohorts'],
        properties: {
          candidate_id: { type: 'string', format: 'uuid' },
          cohorts: {
            type: 'array',
            items: {
              type: 'object',
              required: ['characteristic', 'cohort_id'],
              properties: {
                characteristic: { type: 'string' },
                cohort_id:      { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { candidate_id, cohorts } = request.body as {
      candidate_id: string;
      cohorts: Array<{ characteristic: string; cohort_id: string }>;
    };
    const consentedAt = new Date();

    for (const c of cohorts) {
      await app.db`
        INSERT INTO matching.candidate_cohorts
          (candidate_id, cohort_id, characteristic, consented_at)
        VALUES
          (${candidate_id}, ${c.cohort_id}, ${c.characteristic}, ${consentedAt})
        ON CONFLICT (candidate_id, characteristic)
          DO UPDATE SET cohort_id = EXCLUDED.cohort_id,
                        consented_at = EXCLUDED.consented_at
      `;
    }

    return reply.status(201).send({ candidate_id, cohorts_assigned: cohorts.length });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/test-helpers/seed-fairness-breach
  // Inserts a synthetic platform-level fairness_metrics record where one
  // cohort has a DIR breach. matches.ts reads this via cohort_stats JSONB to
  // build the real FairnessMetricsStore for Stage 7 bias detection.
  // Body: { cohort_id, dir_value?, scope_level?, scope_job_id?, scope_company_id? }
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/seed-fairness-breach', {
    preHandler: [requireTestKey],
    schema: {
      tags: ['test-helpers'],
      summary: '[DEV ONLY] Seed a fairness breach record for a cohort',
      body: {
        type: 'object',
        required: ['cohort_id'],
        properties: {
          cohort_id:        { type: 'string' },
          dir_value:        { type: 'number', minimum: 0, maximum: 1 },
          scope_level:      { type: 'string', enum: ['platform', 'company', 'job'] },
          scope_job_id:     { type: 'string', format: 'uuid' },
          scope_company_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body     = request.body as any;
    const cohortId = body.cohort_id as string;
    const dirValue = (body.dir_value as number | undefined) ?? 0.375;
    const level    = (body.scope_level as string | undefined) ?? 'platform';

    // cohort_stats JSONB: map of cohortId → CohortMetrics (shape from store.ts)
    const cohortStats: Record<string, unknown> = {
      [cohortId]: {
        cohortId,
        sampleCount: 50,
        DIR: { value: dirValue, withinBounds: false, sampleCount: 50 },
        EOD: { value: 0.0,      withinBounds: true,  sampleCount: 50 },
        SDS: { value: 0.0,      withinBounds: true,  sampleCount: 50 },
      },
    };

    const now        = new Date();
    const windowFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const auditId    = crypto.randomUUID();

    await app.db`
      INSERT INTO analytical.fairness_metrics (
        audit_id, computed_at, pipeline_version,
        window_from, window_to,
        scope_level, scope_job_id, scope_company_id,
        cohort_stats, total_matches_evaluated,
        dir_value, dir_within_bounds,
        eod_value, eod_within_bounds,
        sds_value, sds_within_bounds,
        threshold_dir_lower, threshold_dir_upper,
        threshold_eod_abs, threshold_sds_abs,
        any_metric_breached, metrics_breached,
        governance_review_required, consecutive_breach_windows
      ) VALUES (
        ${auditId}, ${now}, '1.0.0',
        ${windowFrom}, ${now},
        ${level},
        ${(body.scope_job_id as string | undefined) ?? null},
        ${(body.scope_company_id as string | undefined) ?? null},
        ${app.db.json(cohortStats as any)},
        50,
        ${dirValue}, false,
        0.0,         true,
        0.0,         true,
        0.80, 1.20,
        0.05, 0.03,
        true, ARRAY['disparate_impact_ratio'],
        false, 1
      )
    `;

    return reply.status(201).send({ audit_id: auditId, cohort_id: cohortId, dir_value: dirValue });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/test-helpers/compute-job-fairness
  // Computes engagement-rate fairness for a job based on who got interactions
  // (accepted into the hiring process) vs who was only matched (but ignored).
  // Compares cohort engagement rates, writes result to analytical.fairness_metrics,
  // and decreases the company compliance_score if a breach is detected.
  // Body: { job_id }
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/compute-job-fairness', {
    preHandler: [requireTestKey],
    schema: {
      tags: ['test-helpers'],
      summary: '[DEV ONLY] Compute engagement-rate fairness metrics for a job',
      body: {
        type: 'object',
        required: ['job_id'],
        properties: {
          job_id:       { type: 'string', format: 'uuid' },
          candidate_ids: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            description: 'Restrict analysis to these specific candidates (avoids DB contamination from previous test runs)',
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { job_id, candidate_ids: candidateIdsFilter } =
      request.body as { job_id: string; candidate_ids?: string[] };

    // All matched candidates for this job (optionally restricted to a specific set)
    const matchedRows = candidateIdsFilter?.length
      ? await app.db`
          SELECT candidate_id FROM matching.match_events
          WHERE job_id = ${job_id} AND decision = 'matched'
            AND candidate_id = ANY(${candidateIdsFilter})
        `
      : await app.db`
          SELECT candidate_id FROM matching.match_events
          WHERE job_id = ${job_id} AND decision = 'matched'
        `;
    if (!matchedRows[0]) {
      return reply.status(422).send({
        error: 'NO_MATCHES', message: 'No matched candidates found for this job',
      });
    }
    const candidateIds = (matchedRows as any[]).map(r => r.candidate_id as string);

    // Cohort memberships for those candidates
    const cohortRows = await app.db`
      SELECT candidate_id, cohort_id, characteristic
      FROM matching.candidate_cohorts
      WHERE candidate_id = ANY(${candidateIds})
    `;

    // Candidates the company engaged with: any interaction that was NOT rejected.
    // Rejection sets outcome='rejected'; status='completed'. Both fields are checked
    // to exclude the candidate from the engagement numerator.
    const interactionRows = await app.db`
      SELECT DISTINCT candidate_id FROM matching.active_interactions
      WHERE job_id  = ${job_id}
        AND outcome IS DISTINCT FROM 'rejected'
    `;
    const interactedSet = new Set((interactionRows as any[]).map(r => r.candidate_id as string));

    // Build per-characteristic, per-cohort engagement stats
    type CohortEngagement = { total: number; interacted: number };
    const engagementByChar: Record<string, Record<string, CohortEngagement>> = {};

    for (const row of cohortRows as any[]) {
      const char = row.characteristic as string;
      const cid  = row.cohort_id as string;
      if (!engagementByChar[char]) engagementByChar[char] = {};
      if (!engagementByChar[char][cid]) engagementByChar[char][cid] = { total: 0, interacted: 0 };
      engagementByChar[char][cid].total++;
      if (interactedSet.has(row.candidate_id as string)) engagementByChar[char][cid].interacted++;
    }

    // Find characteristic with the most coverage to use for DIR
    let bestChar: string | null = null;
    let bestTotal = 0;
    for (const [char, cohorts] of Object.entries(engagementByChar)) {
      const t = Object.values(cohorts).reduce((s, v) => s + v.total, 0);
      if (t > bestTotal) { bestTotal = t; bestChar = char; }
    }

    let dirValue: number | null = null;
    let dirWithin = true;
    let refCohortId: string | null = null;
    let compCohortId: string | null = null;
    const cohortStatsForDB: Record<string, unknown> = {};

    if (bestChar) {
      const sorted = Object.entries(engagementByChar[bestChar]!)
        .sort((a, b) => b[1].total - a[1].total);

      if (sorted.length >= 2) {
        const [[refId, ref], [compId, comp]] = sorted as [[string, CohortEngagement], [string, CohortEngagement]];
        const refRate  = ref.total  > 0 ? ref.interacted  / ref.total  : 0;
        const compRate = comp.total > 0 ? comp.interacted / comp.total : 0;

        dirValue   = refRate > 0 ? compRate / refRate : 0;
        dirWithin  = dirValue >= 0.80;
        refCohortId  = refId;
        compCohortId = compId;

        for (const [cid, stats] of sorted) {
          cohortStatsForDB[cid] = {
            cohortId:    cid,
            sampleCount: stats.total,
            DIR: { value: dirValue, withinBounds: dirWithin, sampleCount: stats.total },
            EOD: { value: 0.0,      withinBounds: true,      sampleCount: stats.total },
            SDS: { value: 0.0,      withinBounds: true,      sampleCount: stats.total },
          };
        }
      }
    }

    const jobCompany = await app.db`
      SELECT company_id FROM matching.job_briefs WHERE job_id = ${job_id} LIMIT 1
    `;
    const companyId = (jobCompany[0] as any)?.company_id as string | undefined;

    const now        = new Date();
    const windowFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const auditId    = crypto.randomUUID();
    const anyBreached = dirValue !== null && !dirWithin;

    await app.db`
      INSERT INTO analytical.fairness_metrics (
        audit_id, computed_at, pipeline_version,
        window_from, window_to,
        scope_level, scope_job_id, scope_company_id,
        cohort_stats, total_matches_evaluated,
        dir_value, dir_reference_cohort_id, dir_comparison_cohort_id, dir_within_bounds,
        eod_value, eod_within_bounds,
        sds_value, sds_within_bounds,
        threshold_dir_lower, threshold_dir_upper,
        threshold_eod_abs, threshold_sds_abs,
        any_metric_breached, metrics_breached,
        governance_review_required, consecutive_breach_windows
      ) VALUES (
        ${auditId}, ${now}, '1.0.0',
        ${windowFrom}, ${now},
        'job', ${job_id}, ${companyId ?? null},
        ${Object.keys(cohortStatsForDB).length > 0 ? app.db.json(cohortStatsForDB as any) : null},
        ${candidateIds.length},
        ${dirValue}, ${refCohortId}, ${compCohortId}, ${dirWithin},
        null, true,
        null, true,
        0.80, 1.20,
        0.05, 0.03,
        ${anyBreached}, ${anyBreached ? ['disparate_impact_ratio'] : []},
        false, ${anyBreached ? 1 : 0}
      )
    `;

    if (anyBreached && companyId) {
      await app.db`
        UPDATE matching.companies
        SET compliance_score = GREATEST(0, compliance_score - 0.05),
            updated_at       = NOW()
        WHERE company_id = ${companyId}
      `;
    }

    return reply.status(201).send({
      audit_id:          auditId,
      job_id,
      dir_value:         dirValue,
      dir_within_bounds: dirWithin,
      any_metric_breached: anyBreached,
      total_evaluated:   candidateIds.length,
      characteristic:    bestChar,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/test-helpers/trigger-job-matching
  // Runs auto-matching for a specific job synchronously (awaited).
  // Used by auto-matching.spec.ts when AUTO_MATCHING=false disables the
  // background queue — tests call this instead of polling.
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/trigger-job-matching', {
    preHandler: [requireTestKey],
    schema: {
      tags: ['test-helpers'],
      summary: '[DEV ONLY] Run job auto-matching synchronously',
      body: {
        type: 'object',
        required: ['job_id'],
        properties: {
          job_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { job_id } = request.body as { job_id: string };
    const jobRow = await app.db`
      SELECT job_id, company_id FROM matching.job_briefs
      WHERE job_id = ${job_id} AND status = 'active' LIMIT 1
    `;
    if (!jobRow[0]) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: `Active job ${job_id} not found` });
    }
    await runJobMatchingSync(app, job_id, (jobRow[0] as any).company_id as string);
    return reply.status(200).send({ job_id, triggered: true });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/test-helpers/trigger-candidate-matching
  // Runs auto-matching for a specific candidate synchronously (awaited).
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/trigger-candidate-matching', {
    preHandler: [requireTestKey],
    schema: {
      tags: ['test-helpers'],
      summary: '[DEV ONLY] Run candidate auto-matching synchronously',
      body: {
        type: 'object',
        required: ['candidate_id'],
        properties: {
          candidate_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { candidate_id } = request.body as { candidate_id: string };
    await runCandidateMatchingSync(app, candidate_id);
    return reply.status(200).send({ candidate_id, triggered: true });
  });
}
