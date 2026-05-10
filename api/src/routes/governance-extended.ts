/**
 * FHP API — Governance Extensions
 *
 * GET  /v1/governance/summary              — protocol health KPIs
 * GET  /v1/governance/fairness/companies   — per-company fairness table
 * GET  /v1/governance/votes               — Protocol Council vote record
 * POST /v1/governance/votes               — record a PC vote
 * GET  /v1/governance/proposals           — FHP-P proposals list
 * GET  /v1/governance/proposals/:id       — single proposal detail
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireGovernance }                                   from '../middleware/auth.ts';
import { NotFoundError }                                       from '../errors/index.ts';

export async function governanceExtendedRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/governance/summary
   * Platform health KPIs for the Governance Dashboard Overview tab.
   * Public — governance dashboard is publicly readable.
   */
  app.get('/summary', {
    schema: {
      tags: ['governance'],
      summary: 'Platform health KPIs for governance overview',
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {

    const [companies, escalations, proposals, fairness, latestVersion] = await Promise.all([
      app.db`
        SELECT
          COUNT(*)                                           AS total_registered,
          COUNT(*) FILTER (WHERE status = 'active')          AS active,
          COUNT(*) FILTER (WHERE status = 'suspended')       AS suspended,
          COUNT(*) FILTER (WHERE status = 'pending_verification') AS pending,
          ROUND(AVG(compliance_score)::numeric, 2)           AS avg_compliance_score
        FROM matching.companies
      `,
      app.db`
        SELECT
          COUNT(*)                                                   AS total_open,
          COUNT(*) FILTER (WHERE priority = 'critical')              AS critical,
          COUNT(*) FILTER (WHERE priority = 'urgent')                AS urgent,
          COUNT(*) FILTER (WHERE escalation_type = 'fairness_breach') AS fairness_breaches,
          COUNT(*) FILTER (WHERE escalation_type = 'appeal')         AS appeals
        FROM matching.escalations
        WHERE status = 'open'
      `,
      app.db`
        SELECT COUNT(*) AS open_proposals
        FROM matching.governance_proposals
        WHERE status = 'under_review'
      `,
      app.db`
        SELECT
          ROUND(AVG(dir_value)::numeric, 3)   AS platform_dir,
          ROUND(AVG(eod_value)::numeric, 3)   AS platform_eod,
          ROUND(AVG(sds_value)::numeric, 3)   AS platform_sds,
          COUNT(*) FILTER (WHERE NOT dir_within_bounds) AS dir_breach_count,
          COUNT(*) FILTER (WHERE NOT eod_within_bounds) AS eod_breach_count,
          COUNT(*) FILTER (WHERE NOT sds_within_bounds) AS sds_breach_count,
          MAX(computed_at) AS last_computed
        FROM analytical.fairness_metrics
        WHERE computed_at = (
          SELECT MAX(fm2.computed_at) FROM analytical.fairness_metrics fm2
          WHERE fm2.company_id = analytical.fairness_metrics.company_id
        )
      `,
      app.db`SELECT value FROM config.governance_constants WHERE key = 'FHP_VERSION' LIMIT 1`,
    ]);

    return reply.send({
      fhp_version:   latestVersion[0]?.value ?? '1.0.0',
      companies:     companies[0],
      escalations:   escalations[0],
      proposals: {
        open: proposals[0]?.open_proposals ?? 0,
      },
      platform_fairness: fairness[0],
      generated_at:  new Date().toISOString(),
    });
  });

  /**
   * GET /v1/governance/fairness/companies
   * Per-company fairness metrics table — Fairness tab in governance dashboard.
   * Public — transparency is a core FHP commitment.
   */
  app.get('/fairness/companies', {
    schema: {
      tags: ['governance'],
      summary: 'Per-company fairness metrics (latest window)',
      querystring: {
        type: 'object',
        properties: {
          status:        { type: 'string', enum: ['all','breached','ok'], default: 'all' },
          jurisdiction:  { type: 'string' },
          limit:         { type: 'integer', default: 50 },
          offset:        { type: 'integer', default: 0 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as {
      status: string; jurisdiction?: string; limit: number; offset: number;
    };

    const rows = await app.db`
      SELECT
        c.company_id, c.legal_name, c.jurisdiction, c.status AS company_status,
        c.compliance_score,
        fm.dir_value, fm.dir_within_bounds,
        fm.eod_value, fm.eod_within_bounds,
        fm.sds_value, fm.sds_within_bounds,
        fm.consecutive_breach_windows,
        fm.total_candidates_evaluated,
        fm.computed_at,
        CASE
          WHEN NOT fm.dir_within_bounds OR NOT fm.eod_within_bounds OR NOT fm.sds_within_bounds
            THEN 'breach'
          ELSE 'ok'
        END AS fairness_status
      FROM matching.companies c
      JOIN analytical.fairness_metrics fm ON fm.company_id = c.company_id
        AND fm.computed_at = (
          SELECT MAX(fm2.computed_at) FROM analytical.fairness_metrics fm2
          WHERE fm2.company_id = c.company_id AND fm2.job_id IS NULL
        )
      WHERE c.status NOT IN ('draft')
        ${q.jurisdiction ? app.db`AND c.jurisdiction = ${q.jurisdiction}` : app.db``}
        ${q.status === 'breached' ? app.db`AND (NOT fm.dir_within_bounds OR NOT fm.eod_within_bounds OR NOT fm.sds_within_bounds)` : app.db``}
        ${q.status === 'ok'       ? app.db`AND fm.dir_within_bounds AND fm.eod_within_bounds AND fm.sds_within_bounds` : app.db``}
      ORDER BY fm.consecutive_breach_windows DESC, c.legal_name
      LIMIT  ${q.limit}
      OFFSET ${q.offset}
    `;

    return reply.send({ companies: rows });
  });

  /**
   * GET /v1/governance/votes
   * Protocol Council vote record — Votes tab.
   * Public — all PC votes are published.
   */
  app.get('/votes', {
    schema: {
      tags: ['governance'],
      summary: 'Protocol Council vote record',
      querystring: {
        type: 'object',
        properties: {
          result: { type: 'string', enum: ['passed','failed','pending','all'], default: 'all' },
          limit:  { type: 'integer', default: 50 },
          offset: { type: 'integer', default: 0 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { result: string; limit: number; offset: number };

    const rows = await app.db`
      SELECT
        v.vote_id, v.resolution_ref, v.question,
        v.votes_for, v.votes_against, v.votes_abstain, v.total_eligible,
        v.majority_required, v.result, v.fob_veto_exercised,
        v.voted_at, v.notes,
        p.proposal_ref, p.title AS proposal_title
      FROM matching.governance_votes v
      LEFT JOIN matching.governance_proposals p USING (proposal_id)
      WHERE TRUE
        ${q.result !== 'all' ? app.db`AND v.result = ${q.result}` : app.db``}
      ORDER BY COALESCE(v.voted_at, v.created_at) DESC
      LIMIT  ${q.limit}
      OFFSET ${q.offset}
    `;

    return reply.send({ votes: rows });
  });

  /**
   * POST /v1/governance/votes
   * Record a Protocol Council vote. Requires governance role.
   */
  app.post('/votes', {
    preHandler: [requireGovernance],
    schema: {
      tags: ['governance'],
      summary: 'Record a Protocol Council vote',
      body: {
        type: 'object',
        required: ['resolution_ref','question','votes_for','votes_against','votes_abstain'],
        additionalProperties: false,
        properties: {
          resolution_ref:       { type: 'string', minLength: 5 },
          proposal_id:          { type: 'string', format: 'uuid' },
          question:             { type: 'string', minLength: 10 },
          votes_for:            { type: 'integer', minimum: 0, maximum: 6 },
          votes_against:        { type: 'integer', minimum: 0, maximum: 6 },
          votes_abstain:        { type: 'integer', minimum: 0, maximum: 6 },
          total_eligible:       { type: 'integer', minimum: 1, maximum: 10, default: 6 },
          majority_required:    { type: 'integer', minimum: 1, maximum: 10, default: 4 },
          fob_veto_exercised:   { type: 'boolean', default: false },
          notes:                { type: 'string', maxLength: 2000 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      resolution_ref: string; proposal_id?: string; question: string;
      votes_for: number; votes_against: number; votes_abstain: number;
      total_eligible?: number; majority_required?: number;
      fob_veto_exercised?: boolean; notes?: string;
    };

    const majority = body.majority_required ?? 4;
    const result = body.fob_veto_exercised
      ? 'failed'
      : body.votes_for >= majority ? 'passed' : 'failed';

    const [row] = await app.db`
      INSERT INTO matching.governance_votes (
        resolution_ref, proposal_id, question,
        votes_for, votes_against, votes_abstain,
        total_eligible, majority_required,
        fob_veto_exercised, result, voted_at, notes
      ) VALUES (
        ${body.resolution_ref},
        ${body.proposal_id ?? null},
        ${body.question},
        ${body.votes_for}, ${body.votes_against}, ${body.votes_abstain},
        ${body.total_eligible ?? 6}, ${majority},
        ${body.fob_veto_exercised ?? false},
        ${result}, NOW(), ${body.notes ?? null}
      )
      RETURNING vote_id, result, voted_at
    `;

    // If vote passed and linked to a proposal, advance proposal status
    if (result === 'passed' && body.proposal_id) {
      await app.db`
        UPDATE matching.governance_proposals SET
          status      = 'accepted',
          resolved_at = NOW(),
          updated_at  = NOW()
        WHERE proposal_id = ${body.proposal_id}
      `;
    }

    // Public audit
    await app.db`
      INSERT INTO audit.governance_log (
        event_type, entity_type, entity_id, actor_type, actor_id, summary
      ) VALUES (
        'pc_vote_recorded', 'vote', ${row.vote_id},
        'governance', 'protocol-council',
        ${body.resolution_ref + ': ' + result.toUpperCase() + ' (' + body.votes_for + '/' + (body.total_eligible ?? 6) + ')'}
      )
    `;

    return reply.status(201).send({ vote_id: row.vote_id, result, voted_at: row.voted_at });
  });

  /**
   * GET /v1/governance/proposals
   * FHP-P proposals list — Proposals tab.
   * Public.
   */
  app.get('/proposals', {
    schema: {
      tags: ['governance'],
      summary: 'List FHP-P governance proposals',
      querystring: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['draft','under_review','accepted','rejected','withdrawn','all'],
            default: 'under_review',
          },
          limit:  { type: 'integer', default: 20 },
          offset: { type: 'integer', default: 0 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { status: string; limit: number; offset: number };

    const rows = await app.db`
      SELECT
        p.proposal_id, p.proposal_ref, p.title, p.summary,
        p.submitted_by, p.affiliation, p.status,
        p.review_deadline, p.fhp_version_target,
        p.fairness_impact, p.submitted_at, p.resolved_at,
        -- Comment count from audit log
        (SELECT COUNT(*) FROM audit.governance_log
         WHERE entity_id = p.proposal_id::text) AS comment_count,
        -- Linked vote (if any)
        (SELECT json_build_object(
           'vote_id',  v.vote_id,
           'result',   v.result,
           'votes_for', v.votes_for,
           'voted_at', v.voted_at
         )
         FROM matching.governance_votes v
         WHERE v.proposal_id = p.proposal_id
         ORDER BY v.created_at DESC LIMIT 1
        ) AS vote
      FROM matching.governance_proposals p
      WHERE TRUE
        ${q.status !== 'all' ? app.db`AND p.status = ${q.status}` : app.db``}
      ORDER BY p.submitted_at DESC
      LIMIT  ${q.limit}
      OFFSET ${q.offset}
    `;

    return reply.send({ proposals: rows });
  });

  /**
   * GET /v1/governance/proposals/:proposalId
   * Full proposal detail — Proposals tab click-through.
   */
  app.get('/proposals/:proposalId', {
    schema: {
      tags: ['governance'],
      summary: 'Get full governance proposal detail',
      params: {
        type: 'object',
        properties: { proposalId: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { proposalId } = request.params as { proposalId: string };

    const [proposal] = await app.db`
      SELECT
        p.*,
        -- All votes on this proposal
        (SELECT json_agg(json_build_object(
           'vote_id',          v.vote_id,
           'resolution_ref',   v.resolution_ref,
           'result',           v.result,
           'votes_for',        v.votes_for,
           'votes_against',    v.votes_against,
           'fob_veto_exercised', v.fob_veto_exercised,
           'voted_at',         v.voted_at
         ) ORDER BY v.voted_at)
         FROM matching.governance_votes v
         WHERE v.proposal_id = p.proposal_id
        ) AS votes,
        -- Public comments from audit log
        (SELECT json_agg(json_build_object(
           'event_type', gl.event_type,
           'summary',    gl.summary,
           'occurred_at', gl.occurred_at
         ) ORDER BY gl.occurred_at)
         FROM audit.governance_log gl
         WHERE gl.entity_id = p.proposal_id::text
        ) AS public_record
      FROM matching.governance_proposals p
      WHERE p.proposal_id = ${proposalId}
      LIMIT 1
    `;

    if (!proposal) throw new NotFoundError('Proposal', proposalId);

    return reply.send(proposal);
  });
}
