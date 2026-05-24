/**
 * FHP API — Company Dashboard Extensions
 *
 * All 11 new endpoints needed for the company dashboard nav pages:
 *
 * GET  /v1/companies/me/jobs                        — list all job briefs
 * GET  /v1/companies/me/sla                         — SLA monitor KPIs + interactions
 * GET  /v1/companies/me/interactions                — active hiring processes
 * POST /v1/companies/me/interactions/:id/reject     — send structured rejection
 * GET  /v1/companies/me/ghosting                    — full ghosting event list
 * PUT  /v1/companies/me/ghosting/:id                — resolve or dispute ghosting
 * GET  /v1/companies/me/fairness/jobs               — per-job fairness metrics
 * POST /v1/companies/me/fairness/remediation        — submit remediation plan
 * GET  /v1/companies/me/appeals                     — appeals against company jobs
 * GET  /v1/companies/me/audit                       — company audit log
 * GET  /v1/reference/rejection-codes                — structured rejection taxonomy
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCompany }                                       from '../middleware/auth.ts';
import { NotFoundError, ValidationError }                       from '../errors/index.ts';
import { rejectHtml }                                           from '../utils/validation.ts';

export async function companiesExtendedRoutes(app: FastifyInstance): Promise<void> {

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/companies/me/jobs
  // All job briefs for the company — the Active Job Briefs nav page.
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/me/jobs', {
    preHandler: [requireCompany],
    schema: {
      tags: ['companies'],
      summary: 'List all company job briefs',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active','paused','closed','expired','all'], default: 'active' },
          limit:  { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId = (request.user as any).companyId as string;
    const q = request.query as { status: string; limit: number; offset: number };

    const jobs = await app.db`
      SELECT
        jb.job_id, jb.title, jb.role_summary, jb.status, jb.work_mode,
        jb.hybrid_days_on_site, jb.employment_type,
        jb.location_country, jb.location_region, jb.location_city,
        jb.salary_minimum, jb.salary_maximum, jb.salary_currency, jb.salary_period,
        jb.skills_required, jb.process_stages, jb.max_notice_period_days, jb.tech_stack_summary,
        jb.team_size, jb.reports_to_role, jb.direct_reports,
        jb.target_start_date, jb.response_sla_days,
        jb.attest_no_degree_requirement, jb.attest_no_institution_preference,
        jb.attest_no_graduation_year_filter, jb.attest_no_unpaid_work,
        jb.expires_at, jb.created_at, jb.updated_at,
        -- Match counts
        (SELECT COUNT(*)::int FROM matching.match_events m
         WHERE m.job_id = jb.job_id)                                  AS total_candidates,
        (SELECT COUNT(*)::int FROM matching.match_events m
         WHERE m.job_id = jb.job_id AND m.decision = 'matched')       AS matched_count,
        -- Latest fairness metrics for this job
        (SELECT json_build_object(
           'dir_value',         fm.dir_value,
           'eod_value',         fm.eod_value,
           'sds_value',         fm.sds_value,
           'all_within_bounds', (fm.dir_within_bounds AND fm.eod_within_bounds AND fm.sds_within_bounds)
         )
         FROM analytical.fairness_metrics fm
         WHERE fm.scope_job_id = jb.job_id
         ORDER BY fm.computed_at DESC LIMIT 1
        ) AS latest_fairness,
        -- Days until expiry
        EXTRACT(DAY FROM jb.expires_at - NOW())::int AS days_until_expiry
      FROM matching.job_briefs jb
      WHERE jb.company_id = ${companyId}
        ${q.status !== 'all' ? app.db`AND jb.status = ${q.status}` : app.db``}
      ORDER BY jb.created_at DESC
      LIMIT  ${q.limit}
      OFFSET ${q.offset}
    `;

    const total = await app.db`
      SELECT COUNT(*)::int AS count FROM matching.job_briefs
      WHERE company_id = ${companyId}
        ${q.status !== 'all' ? app.db`AND status = ${q.status}` : app.db``}
    `;

    return reply.send({ jobs, total: total[0]?.count ?? 0 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/companies/me/sla
  // SLA Monitor page: KPIs + all active interactions with SLA deadline detail.
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/me/sla', {
    preHandler: [requireCompany],
    schema: {
      tags: ['companies'],
      summary: 'SLA monitor — KPIs and active interactions with deadline status',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId = (request.user as any).companyId as string;

    // Active interactions with SLA calculations
    const interactions = await app.db`
      SELECT
        ai.interaction_id, ai.match_id, ai.current_stage, ai.status,
        ai.sla_deadline, ai.last_contact_at, ai.created_at,
        -- Time remaining in hours (negative = overdue)
        EXTRACT(EPOCH FROM (ai.sla_deadline - NOW())) / 3600 AS hours_remaining,
        -- SLA status band
        CASE
          WHEN ai.sla_deadline < NOW()                              THEN 'breached'
          WHEN ai.sla_deadline < NOW() + INTERVAL '24 hours'       THEN 'due_today'
          WHEN ai.sla_deadline < NOW() + INTERVAL '72 hours'       THEN 'due_soon'
          ELSE 'on_track'
        END AS sla_status,
        jb.title AS job_title
      FROM matching.active_interactions ai
      JOIN matching.job_briefs jb ON jb.job_id = ai.job_id
      WHERE ai.company_id = ${companyId}
        AND ai.status     = 'active'
      ORDER BY ai.sla_deadline ASC
    `;

    // KPI aggregates
    const kpis = {
      total_active:        interactions.length,
      breached:            interactions.filter((i: any) => i.sla_status === 'breached').length,
      due_today:           interactions.filter((i: any) => i.sla_status === 'due_today').length,
      due_soon:            interactions.filter((i: any) => i.sla_status === 'due_soon').length,
      on_track:            interactions.filter((i: any) => i.sla_status === 'on_track').length,
    };

    // Overall SLA compliance rate (30d window)
    const compliance = await app.db`
      SELECT
        COUNT(*) FILTER (WHERE status = 'resolved' AND outcome != 'ghosting')::int AS resolved_ok,
        COUNT(*) FILTER (WHERE status IN ('resolved','completed'))::int             AS resolved_total,
        CASE
          WHEN COUNT(*) FILTER (WHERE status IN ('resolved','completed')) = 0 THEN 100
          ELSE ROUND(100.0 *
            COUNT(*) FILTER (WHERE status = 'resolved' AND outcome != 'ghosting') /
            COUNT(*) FILTER (WHERE status IN ('resolved','completed'))
          )::int
        END AS compliance_pct
      FROM matching.active_interactions
      WHERE company_id = ${companyId}
        AND created_at > NOW() - INTERVAL '30 days'
    `;

    return reply.send({
      kpis: {
        ...kpis,
        compliance_pct_30d: compliance[0]?.compliance_pct ?? 100,
      },
      interactions,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/companies/me/interactions
  // All active hiring processes — Match Pipeline and Rejections pages.
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/me/interactions', {
    preHandler: [requireCompany],
    schema: {
      tags: ['companies'],
      summary: 'All active hiring interactions for this company',
      querystring: {
        type: 'object',
        properties: {
          status:           { type: 'string', default: 'active' },
          needs_rejection:  { type: 'boolean', default: false },
          job_id:           { type: 'string', format: 'uuid' },
          limit:            { type: 'integer', default: 50 },
          offset:           { type: 'integer', default: 0 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId = (request.user as any).companyId as string;
    const q = request.query as {
      status: string; needs_rejection: boolean;
      job_id?: string; limit: number; offset: number;
    };

    const rows = await app.db`
      SELECT
        ai.interaction_id, ai.match_id, ai.current_stage, ai.status, ai.outcome,
        ai.sla_deadline, ai.last_contact_at, ai.created_at, ai.updated_at,
        ai.rejection_reason_code, ai.rejection_notes,
        jb.job_id, jb.title AS job_title,
        m.overall_score, m.decision,
        -- Whether a rejection is overdue
        CASE
          WHEN ai.outcome IS NULL AND ai.status = 'active'
               AND ai.sla_deadline < NOW() THEN TRUE
          ELSE FALSE
        END AS rejection_overdue
      FROM matching.active_interactions ai
      JOIN matching.job_briefs   jb ON jb.job_id  = ai.job_id
      JOIN matching.match_events m  ON m.match_id = ai.match_id
      WHERE ai.company_id = ${companyId}
        ${q.status !== 'all' ? app.db`AND ai.status = ${q.status}` : app.db``}
        ${q.needs_rejection ? app.db`AND ai.outcome IS NULL AND ai.status = 'active'` : app.db``}
        ${q.job_id ? app.db`AND ai.job_id = ${q.job_id}` : app.db``}
      ORDER BY ai.sla_deadline ASC
      LIMIT  ${q.limit}
      OFFSET ${q.offset}
    `;

    return reply.send({ interactions: rows, total: rows.length });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/companies/me/interactions/:interactionId/reject
  // Send a structured rejection — Rejections page composer.
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/me/interactions/:interactionId/reject', {
    preHandler: [requireCompany],
    schema: {
      tags: ['companies'],
      summary: 'Send a structured rejection for an active interaction',
      params: {
        type: 'object',
        properties: { interactionId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['reason_code'],
        additionalProperties: false,
        properties: {
          reason_code:  { type: 'string', minLength: 4 },
          stage_notes:  { type: 'string', maxLength: 1000 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId         = (request.user as any).companyId as string;
    const { interactionId } = request.params as { interactionId: string };
    const { reason_code, stage_notes } = request.body as {
      reason_code: string; stage_notes?: string;
    };

    rejectHtml(stage_notes, 'stage_notes');

    const interaction = await app.db`
      SELECT ai.interaction_id, ai.candidate_id, ai.match_id, ai.job_id, ai.status
      FROM matching.active_interactions ai
      WHERE ai.interaction_id = ${interactionId}
        AND ai.company_id     = ${companyId}
        AND ai.status         = 'active'
      LIMIT 1
    `;

    if (!interaction[0]) throw new NotFoundError('Interaction', interactionId);

    // Validate reason code exists in taxonomy
    const validCode = await app.db`
      SELECT code FROM config.rejection_codes WHERE code = ${reason_code} LIMIT 1
    `;
    if (!validCode[0]) {
      throw new ValidationError(
        `Unknown rejection code '${reason_code}'. ` +
        'Use GET /v1/reference/rejection-codes for valid codes.'
      );
    }

    const inter = interaction[0] as any;

    // Close the interaction
    await app.db`
      UPDATE matching.active_interactions SET
        status               = 'completed',
        outcome              = 'rejected',
        rejection_reason_code = ${reason_code},
        rejection_notes      = ${stage_notes ?? null},
        updated_at           = NOW()
      WHERE interaction_id = ${interactionId}
    `;

    // Create candidate notification
    await app.db`
      INSERT INTO matching.candidate_notifications (
        candidate_id, notification_type, title, body,
        match_id, interaction_id, job_id, company_id
      ) VALUES (
        ${inter.candidate_id}, 'rejection',
        'Application outcome received',
        ${'Your application has been reviewed. A structured outcome has been sent — check your match history for the full explanation.'},
        ${inter.match_id}, ${interactionId}, ${inter.job_id}, ${companyId}
      )
    `;

    // Audit log
    await app.db`
      INSERT INTO audit.governance_log (
        event_type, entity_type, entity_id, actor_type, actor_id, summary
      ) VALUES (
        'structured_rejection_sent', 'interaction', ${interactionId},
        'company', ${companyId},
        ${'Structured rejection sent. Code: ' + reason_code}
      )
    `;

    return reply.send({
      interaction_id: interactionId,
      status:         'completed',
      outcome:        'rejected',
      reason_code,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/companies/me/ghosting
  // Full ghosting event history — Ghosting Events nav page.
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/me/ghosting', {
    preHandler: [requireCompany],
    schema: {
      tags: ['companies'],
      summary: 'Full ghosting event history for this company',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['open','resolved','disputed','all'], default: 'all' },
          limit:  { type: 'integer', default: 50 },
          offset: { type: 'integer', default: 0 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId = (request.user as any).companyId as string;
    const q = request.query as { status: string; limit: number; offset: number };

    const rows = await app.db`
      SELECT
        ge.ghosting_id, ge.match_id, ge.job_id, ge.stage_name,
        ge.severity, ge.status, ge.detected_at, ge.overdue_hours,
        ge.resolved_at, ge.resolution_type,
        ge.company_strike_count_at_detection,
        ge.candidate_notified_at,
        jb.title AS job_title
      FROM matching.ghosting_events ge
      JOIN matching.job_briefs jb ON jb.job_id = ge.job_id
      WHERE ge.company_id = ${companyId}
        ${q.status !== 'all' ? app.db`AND ge.status = ${q.status}` : app.db``}
      ORDER BY ge.detected_at DESC
      LIMIT  ${q.limit}
      OFFSET ${q.offset}
    `;

    // Summary stats
    const stats = await app.db`
      SELECT
        COUNT(*)                                          AS total,
        COUNT(*) FILTER (WHERE status = 'open')           AS open_count,
        COUNT(*) FILTER (WHERE company_strike_count_at_detection > 0) AS strikes_applied,
        MAX(detected_at)                                  AS most_recent
      FROM matching.ghosting_events
      WHERE company_id = ${companyId}
    `;

    return reply.send({
      ghosting_events:  rows,
      stats:            stats[0],
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /v1/companies/me/ghosting/:ghostingId
  // Resolve or dispute a ghosting event.
  // ─────────────────────────────────────────────────────────────────────────
  app.put('/me/ghosting/:ghostingId', {
    preHandler: [requireCompany],
    schema: {
      tags: ['companies'],
      summary: 'Resolve or dispute a ghosting event',
      params: {
        type: 'object',
        properties: { ghostingId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['action'],
        properties: {
          action:           { type: 'string', enum: ['resolve', 'dispute'] },
          resolution_notes: { type: 'string', maxLength: 2000 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId         = (request.user as any).companyId as string;
    const { ghostingId }    = request.params as { ghostingId: string };
    const { action, resolution_notes } = request.body as {
      action: 'resolve' | 'dispute'; resolution_notes?: string;
    };

    rejectHtml(resolution_notes, 'resolution_notes');

    const event = await app.db`
      SELECT ghosting_id, status
      FROM matching.ghosting_events
      WHERE ghosting_id = ${ghostingId}
        AND company_id  = ${companyId}
        AND status      = 'open'
      LIMIT 1
    `;
    if (!event[0]) throw new NotFoundError('Ghosting event', ghostingId);

    const newStatus = action === 'resolve' ? 'resolved' : 'disputed';

    await app.db`
      UPDATE matching.ghosting_events SET
        status          = ${newStatus},
        resolved_at     = NOW(),
        resolution_type = ${action === 'resolve' ? 'late_response' : null},
        updated_at      = NOW()
      WHERE ghosting_id = ${ghostingId}
    `;

    return reply.send({ ghosting_id: ghostingId, status: newStatus });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/companies/me/fairness/jobs
  // Per-job fairness metrics — Fairness Metrics nav page table.
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/me/fairness/jobs', {
    preHandler: [requireCompany],
    schema: {
      tags: ['companies'],
      summary: 'Per-job fairness metrics for this company',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId = (request.user as any).companyId as string;

    const rows = await app.db`
      SELECT
        jb.job_id, jb.title, jb.status,
        fm.dir_value, fm.dir_within_bounds,
        fm.eod_value, fm.eod_within_bounds,
        fm.sds_value, fm.sds_within_bounds,
        fm.consecutive_breach_windows,
        fm.total_matches_evaluated,
        fm.computed_at,
        -- Breach severity flag
        CASE
          WHEN NOT fm.dir_within_bounds AND NOT fm.eod_within_bounds AND NOT fm.sds_within_bounds
            THEN 'all_breached'
          WHEN NOT fm.dir_within_bounds OR NOT fm.eod_within_bounds OR NOT fm.sds_within_bounds
            THEN 'partial_breach'
          ELSE 'ok'
        END AS breach_level
      FROM matching.job_briefs jb
      JOIN analytical.fairness_metrics fm ON fm.scope_job_id = jb.job_id
        AND fm.scope_level = 'job'
        AND fm.computed_at = (
          SELECT MAX(fm2.computed_at) FROM analytical.fairness_metrics fm2
          WHERE fm2.scope_job_id = jb.job_id AND fm2.scope_level = 'job'
        )
      WHERE jb.company_id = ${companyId}
        AND jb.status = 'active'
      ORDER BY fm.consecutive_breach_windows DESC, jb.title
    `;

    return reply.send({ jobs: rows });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/companies/me/fairness/remediation
  // Submit a fairness remediation plan — shown after breach notice.
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/me/fairness/remediation', {
    preHandler: [requireCompany],
    schema: {
      tags: ['companies'],
      summary: 'Submit a fairness breach remediation plan',
      body: {
        type: 'object',
        required: ['metric_breached', 'job_id', 'plan_text'],
        properties: {
          metric_breached:   { type: 'string', enum: ['DIR','EOD','SDS'] },
          job_id:            { type: 'string', format: 'uuid' },
          escalation_id:     { type: 'string', format: 'uuid' },
          plan_text:         { type: 'string', minLength: 100, maxLength: 10000 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId = (request.user as any).companyId as string;
    const body = request.body as {
      metric_breached: string; job_id: string;
      escalation_id?: string; plan_text: string;
    };

    rejectHtml(body.plan_text, 'plan_text');

    // Verify job belongs to this company
    const job = await app.db`
      SELECT job_id FROM matching.job_briefs
      WHERE job_id = ${body.job_id} AND company_id = ${companyId} LIMIT 1
    `;
    if (!job[0]) throw new NotFoundError('Job brief', body.job_id);

    // Verify breach exists
    const breach = await app.db`
      SELECT dir_within_bounds, eod_within_bounds, sds_within_bounds,
             consecutive_breach_windows
      FROM analytical.fairness_metrics
      WHERE scope_job_id = ${body.job_id} AND scope_level = 'job'
      ORDER BY computed_at DESC LIMIT 1
    `;

    const metricMap: Record<string, string> = {
      DIR: 'dir_within_bounds', EOD: 'eod_within_bounds', SDS: 'sds_within_bounds'
    };
    const metricCol = metricMap[body.metric_breached];
    if (metricCol && breach[0]?.[metricCol]) {
      throw new ValidationError(
        `${body.metric_breached} is currently within bounds for this job. ` +
        'Remediation is only required when a metric is breached.'
      );
    }

    const rows = await app.db`
      INSERT INTO matching.company_remediations (
        company_id, escalation_id, metric_breached, breach_window_num, plan_text
      ) VALUES (
        ${companyId},
        ${body.escalation_id ?? null},
        ${body.metric_breached},
        ${breach[0]?.consecutive_breach_windows ?? 1},
        ${body.plan_text}
      )
      RETURNING remediation_id, submitted_at
    `;
    const row = rows[0] as { remediation_id: string; submitted_at: string };

    // Update escalation if linked
    if (body.escalation_id) {
      await app.db`
        UPDATE matching.escalations SET
          company_response   = ${body.plan_text.substring(0, 500)},
          response_received_at = NOW(),
          updated_at         = NOW()
        WHERE escalation_id = ${body.escalation_id}
      `;
    }

    return reply.status(201).send({
      remediation_id: row.remediation_id,
      submitted_at:   row.submitted_at,
      review_outcome: 'pending',
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/companies/me/appeals
  // Appeals against this company's job briefs — Appeals nav page.
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/me/appeals', {
    preHandler: [requireCompany],
    schema: {
      tags: ['companies'],
      summary: 'Get appeals against this company\'s job briefs',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', default: 'all' },
          limit:  { type: 'integer', default: 50 },
          offset: { type: 'integer', default: 0 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId = (request.user as any).companyId as string;
    const q = request.query as { status: string; limit: number; offset: number };

    const rows = await app.db`
      SELECT
        a.appeal_id, a.status, a.ground, a.submitted_at,
        a.resolved_at, a.outcome, a.twg_finding,
        a.twg_deadline,
        jb.job_id, jb.title AS job_title,
        m.overall_score, m.decision
      FROM matching.appeals a
      JOIN matching.match_events m  ON m.match_id = a.match_id
      JOIN matching.job_briefs   jb ON jb.job_id  = m.job_id
      WHERE jb.company_id = ${companyId}
        ${q.status !== 'all' ? app.db`AND a.status = ${q.status}` : app.db``}
      ORDER BY a.submitted_at DESC
      LIMIT  ${q.limit}
      OFFSET ${q.offset}
    `;

    // Note: candidate_id is deliberately excluded — companies see the appeal
    // but not which candidate filed it (anonymity preserved until outcome)

    return reply.send({ appeals: rows });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/companies/me/pipeline
  // Cross-job pipeline run history with inline employer explanations.
  // Candidate identity is never exposed — match_id only.
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/me/pipeline', {
    preHandler: [requireCompany],
    schema: {
      tags: ['companies'],
      summary: 'Pipeline run history across all company jobs',
      querystring: {
        type: 'object',
        properties: {
          job_id:   { type: 'string', format: 'uuid' },
          decision: { type: 'string', enum: ['matched','borderline','not_matched','all'], default: 'all' },
          limit:    { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          offset:   { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId = (request.user as any).companyId as string;
    const q = request.query as {
      job_id?: string; decision: string; limit: number; offset: number;
    };

    const [runs, statsRows, totalRows] = await Promise.all([
      app.db`
        SELECT
          me.match_id,
          me.job_id,
          jb.title                       AS job_title,
          me.decision,
          me.overall_score,
          me.pre_correction_score,
          me.skill_score,
          me.transferable_skill_score,
          me.preference_alignment_score,
          me.bias_correction_triggered,
          me.bias_correction_delta,
          pt.duration_ms,
          me.created_at,
          expl.plain_language_summary,
          expl.skill_breakdown
        FROM matching.match_events me
        JOIN matching.job_briefs jb ON jb.job_id = me.job_id
        LEFT JOIN analytical.pipeline_traces pt ON pt.match_id = me.match_id
        LEFT JOIN matching.match_explanations expl
          ON expl.match_id = me.match_id AND expl.audience = 'employer'
        WHERE me.company_id = ${companyId}
          ${q.job_id ? app.db`AND me.job_id = ${q.job_id}` : app.db``}
          ${q.decision !== 'all' ? app.db`AND me.decision = ${q.decision}` : app.db``}
        ORDER BY me.created_at DESC
        LIMIT  ${q.limit}
        OFFSET ${q.offset}
      `,
      app.db`
        SELECT
          COUNT(*)::int                                                    AS total_runs,
          COUNT(*) FILTER (WHERE decision = 'matched')::int                AS matched,
          COUNT(*) FILTER (WHERE decision = 'borderline')::int             AS borderline,
          COUNT(*) FILTER (WHERE decision = 'not_matched')::int            AS not_matched,
          COUNT(*) FILTER (WHERE bias_correction_triggered = TRUE)::int    AS bias_corrected,
          ROUND(AVG(overall_score)::numeric, 3)                            AS avg_score
        FROM matching.match_events
        WHERE company_id = ${companyId}
          ${q.job_id ? app.db`AND job_id = ${q.job_id}` : app.db``}
      `,
      app.db`
        SELECT COUNT(*)::int AS count
        FROM matching.match_events
        WHERE company_id = ${companyId}
          ${q.job_id ? app.db`AND job_id = ${q.job_id}` : app.db``}
          ${q.decision !== 'all' ? app.db`AND decision = ${q.decision}` : app.db``}
      `,
    ]);

    return reply.send({
      stats: statsRows[0] ?? {
        total_runs: 0, matched: 0, borderline: 0,
        not_matched: 0, bias_corrected: 0, avg_score: null,
      },
      runs,
      total: totalRows[0]?.count ?? 0,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/companies/me/sla-by-stage
  // SLA compliance breakdown by hiring stage — Compliance Overview table.
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/me/sla-by-stage', {
    preHandler: [requireCompany],
    schema: {
      tags: ['companies'],
      summary: 'SLA compliance rate per hiring stage for this company',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId = (request.user as any).companyId as string;

    // Aggregate compliance per stage from all resolved interactions (30d)
    const rows = await app.db`
      SELECT
        current_stage                                                           AS stage,
        COUNT(*)::int                                                           AS total,
        COUNT(*) FILTER (WHERE status IN ('completed','escalated')
                           AND outcome NOT IN ('role_cancelled'))::int          AS completed,
        COUNT(*) FILTER (
          WHERE status IN ('completed','escalated')
            AND outcome NOT IN ('role_cancelled')
            AND sla_deadline >= updated_at
        )::int                                                                  AS within_sla,
        -- Open/active in this stage
        COUNT(*) FILTER (WHERE status = 'active')::int                         AS active_count,
        COUNT(*) FILTER (WHERE status = 'active' AND sla_deadline < NOW())::int AS active_breached,
        -- Ghosting events at this stage
        (SELECT COUNT(*)::int
         FROM matching.ghosting_events ge
         WHERE ge.company_id = ${companyId}
           AND ge.stage_name = ai.current_stage
        )                                                                       AS ghosting_count
      FROM matching.active_interactions ai
      WHERE ai.company_id = ${companyId}
        AND ai.created_at > NOW() - INTERVAL '90 days'
      GROUP BY ai.current_stage
      ORDER BY CASE ai.current_stage
        WHEN 'initial_match_acknowledgement' THEN 1
        WHEN 'application_review'            THEN 2
        WHEN 'screening_call'                THEN 3
        WHEN 'technical_assessment'          THEN 4
        WHEN 'interview_stage'               THEN 5
        WHEN 'offer_stage'                   THEN 6
        WHEN 'post_rejection_feedback'       THEN 7
        ELSE 8
      END
    `;

    const stages = (rows as any[]).map(r => ({
      stage:            r.stage,
      total:            r.total,
      completed:        r.completed,
      within_sla:       r.within_sla,
      compliance_pct:   r.completed > 0
        ? Math.round(100 * r.within_sla / r.completed)
        : null,
      active_count:     r.active_count,
      active_breached:  r.active_breached,
      ghosting_count:   r.ghosting_count,
    }));

    return reply.send({ stages });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/companies/me/audit
  // Company audit log — Audit Log nav page.
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/me/audit', {
    preHandler: [requireCompany],
    schema: {
      tags: ['companies'],
      summary: 'Company compliance audit log',
      querystring: {
        type: 'object',
        properties: {
          event_type: { type: 'string' },
          from_date:  { type: 'string', format: 'date' },
          to_date:    { type: 'string', format: 'date' },
          format:     { type: 'string', enum: ['json', 'csv'], default: 'json' },
          limit:      { type: 'integer', default: 100 },
          offset:     { type: 'integer', default: 0 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId = (request.user as any).companyId as string;
    const q = request.query as {
      event_type?: string; from_date?: string; to_date?: string;
      format: string; limit: number; offset: number;
    };

    const rows = await app.db`
      SELECT
        log_id, event_type, company_id, job_id,
        escalation_id, appeal_id,
        summary, public_summary, is_public,
        actor_role, actor_body, occurred_at
      FROM audit.audit_log
      WHERE company_id = ${companyId}
        ${q.event_type ? app.db`AND event_type = ${q.event_type}` : app.db``}
        ${q.from_date  ? app.db`AND occurred_at >= ${q.from_date}::date` : app.db``}
        ${q.to_date    ? app.db`AND occurred_at <= ${q.to_date}::date + INTERVAL '1 day'` : app.db``}
      ORDER BY occurred_at DESC
      LIMIT  ${q.limit}
      OFFSET ${q.offset}
    `;

    if (q.format === 'csv') {
      const cols = ['occurred_at', 'event_type', 'actor_body', 'summary'];
      const escape = (v: unknown) => {
        if (v == null) return '';
        const s = String(v).replace(/"/g, '""');
        return /[,"\n\r]/.test(s) ? `"${s}"` : s;
      };
      const csv = '﻿' + [   // BOM: tells Excel/Numbers the file is UTF-8
        cols.join(','),
        ...(rows as any[]).map(r => cols.map(c => escape(r[c])).join(',')),
      ].join('\r\n');
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="fhp-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
      return reply.send(csv);
    }

    return reply.send({ audit_log: rows });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/reference/rejection-codes
// Public reference endpoint — structured rejection code taxonomy.
// ─────────────────────────────────────────────────────────────────────────────
export async function referenceRoutes(app: FastifyInstance): Promise<void> {

  app.get('/rejection-codes', {
    schema: {
      tags: ['reference'],
      summary: 'Get the FHP structured rejection code taxonomy',
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const rows = await app.db`
      SELECT code, category, label, description, requires_stage_notes
      FROM config.rejection_codes
      WHERE active = TRUE
      ORDER BY category, code
    `;
    return reply.send({ rejection_codes: rows });
  });
}
