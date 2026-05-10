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

    const [company, latestMetrics, openGhosting, activeJobs, recentAudit] = await Promise.all([
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
    ]);

    return reply.send({
      company:        company[0],
      fairness:       latestMetrics[0] ?? null,
      open_ghosting:  openGhosting,
      active_jobs:    activeJobs,
      recent_audit:   recentAudit,
    });
  });
}
