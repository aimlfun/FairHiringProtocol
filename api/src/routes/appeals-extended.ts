/**
 * FHP API — Appeals Extensions + Ontology + Company Public Record
 *
 * These are additions to existing route groups or new small groups
 * that don't warrant their own file.
 *
 * GET  /v1/candidates/me/appeals          — list all candidate appeals
 * PUT  /v1/candidates/me/appeals/:id      — withdraw an appeal
 * GET  /v1/ontology/skills                — skill search for UI autocomplete
 * GET  /v1/companies/:companyId/public-record — company trust score (public, no auth)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCandidate }                                    from '../middleware/auth.ts';
import { NotFoundError, ValidationError }                      from '../errors/index.ts';
import { rejectHtml }                                          from '../utils/validation.ts';

export async function appealsExtendedRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/candidates/me/appeals
   * Lists all appeals submitted by the authenticated candidate.
   * Previously only GET by ID existed.
   */
  app.get('/me/appeals', {
    preHandler: [requireCandidate],
    schema: {
      tags: ['candidates'],
      summary: 'List all appeals submitted by the candidate',
      querystring: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['submitted','under_twg_review','pc_review','resolved','withdrawn','all'],
            default: 'all',
          },
          limit:  { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            appeals: { type: 'array' },
            total:   { type: 'integer' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;
    const q = request.query as { status: string; limit: number; offset: number };

    const rows = await app.db`
      SELECT
        a.appeal_id, a.match_id, a.status, a.ground, a.detail,
        a.submitted_at, a.resolved_at, a.outcome, a.twg_finding,
        a.twg_deadline, a.submission_deadline,
        jb.title AS job_title,
        m.overall_score, m.decision
      FROM matching.appeals a
      JOIN matching.match_events m  ON m.match_id = a.match_id
      JOIN matching.job_briefs   jb ON jb.job_id  = m.job_id
      WHERE a.candidate_id = ${candidateId}
        ${q.status !== 'all' ? app.db`AND a.status = ${q.status === 'under_twg_review' ? 'twg_review' : q.status}` : app.db``}
      ORDER BY a.submitted_at DESC
      LIMIT  ${q.limit}
      OFFSET ${q.offset}
    `;

    const total = await app.db`
      SELECT COUNT(*)::int AS count FROM matching.appeals
      WHERE candidate_id = ${candidateId}
        ${q.status !== 'all' ? app.db`AND status = ${q.status}` : app.db``}
    `;

    return reply.send({ appeals: rows, total: total[0]?.count ?? 0 });
  });

  /**
   * PUT /v1/candidates/me/appeals/:appealId
   * Withdraw an appeal. Only allowed if status is 'submitted' or 'under_twg_review'.
   * Cannot withdraw once it reaches 'pc_review'.
   */
  app.put('/me/appeals/:appealId', {
    preHandler: [requireCandidate],
    schema: {
      tags: ['candidates'],
      summary: 'Withdraw an appeal',
      params: {
        type: 'object',
        properties: { appealId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['action'],
        properties: {
          action: { type: 'string', enum: ['withdraw'] },
          reason: { type: 'string', maxLength: 500 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId  = (request.user as any).candidateId as string;
    const { appealId } = request.params as { appealId: string };
    const { action, reason } = request.body as { action: string; reason?: string };

    rejectHtml(reason, 'reason');

    const appeal = await app.db`
      SELECT appeal_id, status
      FROM matching.appeals
      WHERE appeal_id    = ${appealId}
        AND candidate_id = ${candidateId}
      LIMIT 1
    `;

    if (!appeal[0]) throw new NotFoundError('Appeal', appealId);

    const withdrawable = ['submitted', 'twg_review'];
    if (!withdrawable.includes(appeal[0].status as string)) {
      throw new ValidationError(
        `Cannot withdraw an appeal with status '${appeal[0].status}'. ` +
        'Appeals can only be withdrawn before they reach Protocol Council review.'
      );
    }

    await app.db`
      UPDATE matching.appeals SET
        status          = 'withdrawn',
        twg_finding     = ${reason ?? 'Withdrawn by candidate'},
        resolved_at     = NOW(),
        updated_at      = NOW()
      WHERE appeal_id = ${appealId}
    `;

    // Escalation audit entry
    await app.db`
      INSERT INTO audit.governance_log (
        event_type, entity_type, entity_id, actor_type, actor_id, summary
      ) VALUES (
        'appeal_withdrawn', 'appeal', ${appealId},
        'candidate', ${candidateId},
        ${'Appeal withdrawn by candidate. Reason: ' + (reason ?? 'Not provided')}
      )
    `;

    return reply.send({ appeal_id: appealId, status: 'withdrawn' });
  });
}

export async function ontologyRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/ontology/skills
   * Skill search for the UI autocomplete in profile editor and job brief form.
   * Unauthenticated — the ontology is public knowledge.
   */
  app.get('/skills', {
    schema: {
      tags: ['ontology'],
      summary: 'Search FHP skill ontology',
      querystring: {
        type: 'object',
        properties: {
          q:      { type: 'string', minLength: 1, maxLength: 100 },
          domain: { type: 'string' },
          limit:  { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { q?: string; domain?: string; limit: number };

    const rows = await app.db`
      SELECT
        skill_id, label, domain,
        -- Include transfer targets so UI can show "also covers X"
        (
          SELECT json_agg(json_build_object(
            'target_skill_id', tr.target_skill_id,
            'target_label',    ts.label,
            'weight',          tr.weight
          ))
          FROM config.skill_transfer_relationships tr
          JOIN config.skills ts ON ts.skill_id = tr.target_skill_id
          WHERE tr.source_skill_id = s.skill_id
        ) AS transfer_targets
      FROM config.skills s
      WHERE s.active = TRUE
        ${q.q ? app.db`AND (
            s.label      ILIKE ${'%' + q.q + '%'}
            OR s.skill_id ILIKE ${'%' + q.q + '%'}
          )` : app.db``}
        ${q.domain ? app.db`AND s.domain = ${q.domain}` : app.db``}
      ORDER BY
        CASE WHEN s.label ILIKE ${(q.q ?? '') + '%'} THEN 0 ELSE 1 END,
        s.label
      LIMIT ${q.limit}
    `;

    return reply.send({ skills: rows, total: rows.length });
  });

  /**
   * GET /v1/ontology/certifications
   * Certification/licence search for UI autocomplete in profile editor and job brief form.
   * Unauthenticated — the ontology is public knowledge.
   */
  app.get('/certifications', {
    schema: {
      tags: ['ontology'],
      summary: 'Search FHP certification and licence ontology',
      querystring: {
        type: 'object',
        properties: {
          q:     { type: 'string', minLength: 1, maxLength: 100 },
          type:  { type: 'string', enum: ['licence', 'certification', 'membership'] },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { q?: string; type?: string; limit: number };

    const rows = await app.db`
      SELECT cert_id, label, issuing_body, cert_type, has_expiry, validity_years, evidences
      FROM config.certifications
      WHERE active = TRUE
        ${q.q ? app.db`AND (
            label        ILIKE ${'%' + q.q + '%'}
            OR issuing_body ILIKE ${'%' + q.q + '%'}
            OR cert_id   ILIKE ${'%' + q.q + '%'}
          )` : app.db``}
        ${q.type ? app.db`AND cert_type = ${q.type}` : app.db``}
      ORDER BY
        CASE WHEN label ILIKE ${(q.q ?? '') + '%'} THEN 0 ELSE 1 END,
        label
      LIMIT ${q.limit}
    `;

    return reply.send({ certifications: rows, total: rows.length });
  });

  /**
   * GET /v1/ontology/domains
   * List all skill domains — used for the domain filter in the skill editor.
   */
  app.get('/domains', {
    schema: {
      tags: ['ontology'],
      summary: 'List skill domains',
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const rows = await app.db`
      SELECT DISTINCT domain, COUNT(*)::int AS skill_count
      FROM config.skills
      WHERE active = TRUE
      GROUP BY domain
      ORDER BY domain
    `;
    return reply.send({ domains: rows });
  });
}

export async function companyPublicRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/companies/:companyId/public-record
   * Public endpoint — no authentication required.
   * Returns the company's compliance score and public record for the trust badge
   * shown on candidate match cards.
   *
   * Only exposes what is appropriate for public view:
   *   - compliance score
   *   - ghosting/SLA compliance rate
   *   - number of active strikes
   *   - DIR/EOD/SDS status (pass/fail, not raw values)
   *   - link to governance record
   */
  app.get('/:companyId/public-record', {
    schema: {
      tags: ['companies'],
      summary: 'Get public compliance record for a company (no auth required)',
      params: {
        type: 'object',
        properties: { companyId: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId } = request.params as { companyId: string };

    const company = await app.db`
      SELECT
        c.company_id, c.legal_name, c.jurisdiction, c.status,
        c.compliance_score, c.strike_count_90d,
        -- Latest fairness metrics (status only — not raw values)
        (
          SELECT json_build_object(
            'dir_within_bounds', fm.dir_within_bounds,
            'eod_within_bounds', fm.eod_within_bounds,
            'sds_within_bounds', fm.sds_within_bounds,
            'all_within_bounds', (fm.dir_within_bounds AND fm.eod_within_bounds AND fm.sds_within_bounds),
            'computed_at',       fm.computed_at
          )
          FROM analytical.fairness_metrics fm
          WHERE fm.scope_company_id = c.company_id
            AND fm.scope_level = 'company'
          ORDER BY fm.computed_at DESC
          LIMIT 1
        ) AS fairness_status,
        -- SLA compliance rate (30d)
        (
          SELECT ROUND(
            100.0 * COUNT(*) FILTER (WHERE ge.status = 'resolved') /
            NULLIF(COUNT(*), 0)
          )
          FROM matching.ghosting_events ge
          WHERE ge.company_id = c.company_id
            AND ge.detected_at > NOW() - INTERVAL '30 days'
        ) AS sla_compliance_pct_30d,
        -- Open escalations count
        (
          SELECT COUNT(*)::int FROM matching.escalations e
          WHERE e.linked_company_id = c.company_id AND e.status = 'open'
        ) AS open_escalation_count
      FROM matching.companies c
      WHERE c.company_id = ${companyId}
      LIMIT 1
    `;

    if (!company[0]) throw new NotFoundError('Company', companyId);

    // Don't expose suspended companies' details beyond status
    const co = company[0] as any;
    if (co.status === 'suspended') {
      return reply.send({
        company_id:    co.company_id,
        legal_name:    co.legal_name,
        status:        'suspended',
        compliance_score: 0,
        governance_url: `https://fhp.example.com/governance/companies/${companyId}`,
      });
    }

    return reply.send({
      company_id:            co.company_id,
      legal_name:            co.legal_name,
      jurisdiction:          co.jurisdiction,
      status:                co.status,
      compliance_score:      co.compliance_score,
      strike_count_90d:      co.strike_count_90d,
      fairness_status:       co.fairness_status,
      sla_compliance_pct_30d: co.sla_compliance_pct_30d,
      open_escalation_count: co.open_escalation_count,
      governance_url:        `https://fhp.example.com/governance/companies/${companyId}`,
    });
  });
}
