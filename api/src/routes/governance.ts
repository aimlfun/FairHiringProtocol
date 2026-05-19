import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCompany, requireCandidate, requireGovernance } from '../middleware/auth.ts';
import {
  NotFoundError, ValidationError, ConflictError,
  JobBriefNotActiveError, CompanyNotActiveError, AppealWindowExpiredError,
  DuplicateAppealError
} from '../errors/index.ts';

export async function governanceRoutes(app: FastifyInstance): Promise<void> {

  /** GET /v1/governance/escalations — public read */
  app.get('/escalations', {
    schema: {
      tags: ['governance'], summary: 'Get all open escalations',
      querystring: {
        type: 'object',
        properties: {
          status:   { type: 'string', enum: ['open','in_review','pending_response','resolved'] },
          priority: { type: 'string', enum: ['standard','urgent','critical'] },
          assignee: { type: 'string' },
          page:     { type: 'integer', minimum: 1, default: 1 },
          limit:    { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as any;
    const offset = ((q.page ?? 1) - 1) * (q.limit ?? 20);

    const rows = await app.db`
      SELECT e.*, a.ground AS appeal_ground, a.detail AS appeal_detail
      FROM matching.escalations e
      LEFT JOIN matching.appeals a ON a.appeal_id = e.linked_appeal_id
      WHERE TRUE
        ${q.status   ? app.db`AND e.status = ${q.status}`     : app.db``}
        ${q.priority ? app.db`AND e.priority = ${q.priority}` : app.db``}
        ${q.assignee ? app.db`AND e.assignee_body = ${q.assignee}` : app.db``}
      ORDER BY
        CASE e.priority WHEN 'critical' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END,
        e.resolution_deadline ASC
      LIMIT ${q.limit ?? 20} OFFSET ${offset}
    `;

    return reply.send({ escalations: rows, page: q.page ?? 1, limit: q.limit ?? 20 });
  });

  /** PUT /v1/governance/escalations/:id */
  app.put('/escalations/:escalationId', {
    preHandler: [requireGovernance],
    schema: {
      tags: ['governance'], summary: 'Update escalation status or outcome',
      params: { type: 'object', properties: { escalationId: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          status:        { type: 'string', enum: ['in_review','pending_response','resolved'] },
          outcome:       { type: 'string', enum: ['upheld','not_upheld','partially_upheld','referred','pending'] },
          outcome_notes: { type: 'string', maxLength: 4096 },
          public_summary:{ type: 'string', maxLength: 1024 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { escalationId } = request.params as { escalationId: string };
    const body = request.body as any;

    const rows = await app.db`
      UPDATE matching.escalations SET
        status        = COALESCE(${body.status ?? null},         status),
        outcome       = COALESCE(${body.outcome ?? null},        outcome),
        outcome_notes = COALESCE(${body.outcome_notes ?? null},  outcome_notes),
        public_summary= COALESCE(${body.public_summary ?? null}, public_summary),
        resolved_at   = CASE WHEN ${body.status ?? ''} = 'resolved' THEN NOW() ELSE resolved_at END,
        updated_at    = NOW()
      WHERE escalation_id = ${escalationId}
      RETURNING *
    `;
    if (!rows[0]) throw new NotFoundError('Escalation', escalationId);

    // If resolved with public_summary — log to public audit
    if (body.status === 'resolved' && body.public_summary) {
      await app.db`
        INSERT INTO audit.audit_log (event_type, escalation_id, summary, public_summary, is_public, actor_body)
        VALUES ('escalation_resolved', ${escalationId}, ${body.outcome_notes ?? body.public_summary},
                ${body.public_summary}, TRUE, 'protocol_council')
      `;
    }

    return reply.send(rows[0]);
  });

  /** GET /v1/governance/audit — public audit log */
  app.get('/audit', {
    schema: {
      tags: ['governance'], summary: 'Public audit log',
      querystring: {
        type: 'object',
        properties: {
          public_only: { type: 'boolean', default: true },
          page:        { type: 'integer', minimum: 1, default: 1 },
          limit:       { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q      = request.query as any;
    const offset = ((q.page ?? 1) - 1) * (q.limit ?? 20);

    const rows = await app.db`
      SELECT log_id, event_type,
             CASE WHEN is_public THEN public_summary ELSE summary END AS summary,
             is_public, actor_body, occurred_at
      FROM audit.audit_log
      WHERE ${q.public_only !== false ? app.db`is_public = TRUE` : app.db`TRUE`}
      ORDER BY occurred_at DESC
      LIMIT ${q.limit ?? 20} OFFSET ${offset}
    `;

    return reply.send({ entries: rows, page: q.page ?? 1, limit: q.limit ?? 20 });
  });

  /** GET /v1/governance/metrics — platform-wide fairness metrics, public read */
  app.get('/metrics', {
    schema: { tags: ['governance'], summary: 'Platform-wide fairness metrics' },
  }, async (_request, reply) => {
    const rows = await app.db`
      SELECT * FROM analytical.fairness_metrics
      WHERE scope_level = 'platform'
      ORDER BY computed_at DESC LIMIT 1
    `;
    return reply.send(rows[0] ?? { message: 'No fairness metrics computed yet' });
  });
}
