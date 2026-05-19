import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCompany, requireCandidate, requireGovernance } from '../middleware/auth.ts';
import {
  NotFoundError, ValidationError, ConflictError,
  JobBriefNotActiveError, CompanyNotActiveError, AppealWindowExpiredError,
  DuplicateAppealError
} from '../errors/index.ts';

export async function companyRoutes(app: FastifyInstance): Promise<void> {

  /** GET /v1/companies/me */
  app.get('/me', {
    preHandler: [requireCompany],
    schema: { tags: ['companies'], summary: 'Get company account', security: [{ bearerAuth: [] }] },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId = (request.user as any).companyId as string;
    const rows = await app.db`
      SELECT company_id, legal_name, jurisdiction, status, compliance_score,
             strike_count_90d, declared_monthly_roles, created_at
      FROM matching.companies WHERE company_id = ${companyId} LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundError('Company', companyId);
    return reply.send(rows[0]);
  });

  /** GET /v1/companies/me/dashboard — compliance metrics */
  app.get('/me/dashboard', {
    preHandler: [requireCompany],
    schema: { tags: ['companies'], summary: 'Company fairness and compliance dashboard', security: [{ bearerAuth: [] }] },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId = (request.user as any).companyId as string;

    const [
      company, latestMetrics, openGhosting, activeJobs, recentAudit,
      bdSla, bdGhosting, bdFairness, bdRejection,
    ] = await Promise.all([
      app.db`SELECT compliance_score, strike_count_90d, status FROM matching.companies WHERE company_id = ${companyId}`,
      app.db`
        SELECT dir_value, dir_within_bounds, eod_value, eod_within_bounds,
               sds_value, sds_within_bounds, any_metric_breached,
               consecutive_breach_windows, ghosting_sla_compliance_rate, computed_at
        FROM analytical.fairness_metrics
        WHERE scope_company_id = ${companyId} AND scope_level = 'company'
        ORDER BY computed_at DESC LIMIT 1
      `,
      app.db`
        SELECT ghosting_id, stage_name, severity, detected_at, overdue_hours
        FROM matching.ghosting_events
        WHERE company_id = ${companyId} AND status = 'open'
        ORDER BY detected_at DESC
      `,
      app.db`
        SELECT job_id, title, status, expires_at, salary_range_wide
        FROM matching.job_briefs
        WHERE company_id = ${companyId} AND status = 'active'
        ORDER BY activated_at DESC LIMIT 10
      `,
      app.db`
        SELECT event_type, summary, occurred_at
        FROM audit.audit_log
        WHERE company_id = ${companyId}
        ORDER BY occurred_at DESC LIMIT 10
      `,
      // Breakdown: SLA compliance rate (30d)
      app.db`
        SELECT
          CASE
            WHEN COUNT(*) FILTER (WHERE status IN ('resolved','completed')) = 0 THEN NULL
            ELSE ROUND(100.0 *
              COUNT(*) FILTER (WHERE status = 'resolved' AND outcome != 'ghosting') /
              NULLIF(COUNT(*) FILTER (WHERE status IN ('resolved','completed')), 0)
            )::int
          END AS sla_pct
        FROM matching.active_interactions
        WHERE company_id = ${companyId}
          AND created_at > NOW() - INTERVAL '30 days'
      `,
      // Breakdown: ghosting rate (90d) — % of interactions not flagged for ghosting
      app.db`
        WITH counts AS (
          SELECT
            (SELECT COUNT(*)::numeric FROM matching.active_interactions
             WHERE company_id = ${companyId} AND created_at > NOW() - INTERVAL '90 days') AS total,
            (SELECT COUNT(*)::numeric FROM matching.ghosting_events
             WHERE company_id = ${companyId} AND detected_at > NOW() - INTERVAL '90 days') AS ghosted
        )
        SELECT
          CASE
            WHEN total = 0 THEN NULL
            ELSE GREATEST(0, ROUND(100.0 - 100.0 * ghosted / total))::int
          END AS ghosting_pct
        FROM counts
      `,
      // Breakdown: fairness — (metrics within bounds) / 3 × 100
      app.db`
        SELECT
          CASE
            WHEN dir_within_bounds IS NULL THEN NULL
            ELSE ROUND(100.0 * (
              (CASE WHEN dir_within_bounds THEN 1 ELSE 0 END) +
              (CASE WHEN eod_within_bounds THEN 1 ELSE 0 END) +
              (CASE WHEN sds_within_bounds THEN 1 ELSE 0 END)
            ) / 3)::int
          END AS fairness_pct
        FROM analytical.fairness_metrics
        WHERE scope_company_id = ${companyId} AND scope_level = 'company'
        ORDER BY computed_at DESC LIMIT 1
      `,
      // Breakdown: structured rejection rate (90d)
      app.db`
        SELECT
          CASE
            WHEN COUNT(*) FILTER (WHERE outcome IS NOT NULL) = 0 THEN NULL
            ELSE ROUND(100.0 *
              COUNT(*) FILTER (WHERE rejection_reason_code IS NOT NULL AND outcome IS NOT NULL) /
              NULLIF(COUNT(*) FILTER (WHERE outcome IS NOT NULL), 0)
            )::int
          END AS rejection_pct
        FROM matching.active_interactions
        WHERE company_id = ${companyId}
          AND created_at > NOW() - INTERVAL '90 days'
      `,
    ]);

    const breakdown = {
      sla_pct:       bdSla[0]?.sla_pct       ?? null,
      ghosting_pct:  bdGhosting[0]?.ghosting_pct ?? null,
      fairness_pct:  bdFairness[0]?.fairness_pct ?? null,
      rejection_pct: bdRejection[0]?.rejection_pct ?? null,
    };

    return reply.send({
      company:              company[0],
      fairness:             latestMetrics[0] ?? null,
      open_ghosting:        openGhosting,
      active_jobs:          activeJobs,
      recent_audit:         recentAudit,
      compliance_breakdown: breakdown,
    });
  });
}
