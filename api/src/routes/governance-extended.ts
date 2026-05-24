/**
 * FHP API — Governance Extensions
 *
 * GET  /v1/governance/summary              — protocol health KPIs
 * GET  /v1/governance/fairness/companies   — per-company fairness table
 * GET  /v1/governance/votes               — Protocol Council vote record
 * POST /v1/governance/votes               — record a PC vote
 * GET  /v1/governance/proposals           — FHP-P proposals list
 * POST /v1/governance/proposals           — submit new proposal (governance auth)
 * GET  /v1/governance/proposals/:id       — single proposal detail
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireGovernance }                                   from '../middleware/auth.ts';
import { NotFoundError }                                       from '../errors/index.ts';
import { rejectHtml }                                          from '../utils/validation.ts';

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
        FROM analytical.fairness_metrics fm1
        WHERE fm1.scope_level = 'company'
          AND fm1.computed_at = (
            SELECT MAX(fm2.computed_at) FROM analytical.fairness_metrics fm2
            WHERE fm2.scope_company_id = fm1.scope_company_id
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
        fm.total_matches_evaluated,
        fm.computed_at,
        CASE
          WHEN NOT fm.dir_within_bounds OR NOT fm.eod_within_bounds OR NOT fm.sds_within_bounds
            THEN 'breach'
          ELSE 'ok'
        END AS fairness_status
      FROM matching.companies c
      JOIN analytical.fairness_metrics fm ON fm.scope_company_id = c.company_id
        AND fm.scope_level = 'company'
        AND fm.computed_at = (
          SELECT MAX(fm2.computed_at) FROM analytical.fairness_metrics fm2
          WHERE fm2.scope_company_id = c.company_id AND fm2.scope_level = 'company'
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

    const totalCast = body.votes_for + body.votes_against + body.votes_abstain;
    if (totalCast === 0) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'At least one vote must be cast (for, against, or abstain).' });
    }

    const majority = body.majority_required ?? 4;
    const result = body.fob_veto_exercised
      ? 'failed'
      : body.votes_for >= majority ? 'passed' : 'failed';

    rejectHtml(body.question as string, 'question');
    rejectHtml(body.notes    as string, 'notes');

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
        'pc_vote_recorded', 'vote', ${row!.vote_id},
        'governance', 'protocol-council',
        ${body.resolution_ref + ': ' + result.toUpperCase() + ' (' + body.votes_for + '/' + (body.total_eligible ?? 6) + ')'}
      )
    `;

    return reply.status(201).send({ vote_id: row!.vote_id, result, voted_at: row!.voted_at });
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

  /**
   * POST /v1/governance/proposals
   * Submit a new governance proposal. Requires governance or admin role.
   */
  app.post('/proposals', {
    preHandler: [requireGovernance],
    schema: {
      tags: ['governance'],
      summary: 'Submit a governance proposal (FHP-P)',
      body: {
        type: 'object',
        required: ['proposal_ref', 'title', 'summary', 'submitted_by', 'document_body'],
        additionalProperties: false,
        properties: {
          proposal_ref:       { type: 'string', minLength: 5, maxLength: 64 },
          title:              { type: 'string', minLength: 5, maxLength: 256 },
          summary:            { type: 'string', minLength: 10, maxLength: 2048 },
          submitted_by:       { type: 'string', minLength: 1, maxLength: 256 },
          affiliation:        { type: 'string', maxLength: 128 },
          review_deadline:    { type: 'string', format: 'date-time' },
          fhp_version_target: { type: 'string', maxLength: 32 },
          document_body:      { type: 'string', minLength: 10, maxLength: 16384 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const b = request.body as any;

    rejectHtml(b.proposal_ref,       'proposal_ref');
    rejectHtml(b.title,              'title');
    rejectHtml(b.summary,            'summary');
    rejectHtml(b.submitted_by,       'submitted_by');
    rejectHtml(b.affiliation ?? '',  'affiliation');
    rejectHtml(b.document_body,      'document_body');

    const document = app.db.json({
      sections: [{ heading: 'Proposal', body: b.document_body }],
    });

    const rows = await app.db`
      INSERT INTO matching.governance_proposals (
        proposal_ref, title, summary, submitted_by, affiliation,
        status, review_deadline, fhp_version_target, document, submitted_at, created_at
      ) VALUES (
        ${b.proposal_ref}, ${b.title}, ${b.summary}, ${b.submitted_by},
        ${b.affiliation ?? null}, 'under_review',
        ${b.review_deadline ?? null}, ${b.fhp_version_target ?? null},
        ${document}, NOW(), NOW()
      )
      RETURNING proposal_id, proposal_ref, status, submitted_at
    `;

    return reply.status(201).send(rows[0]);
  });

  /**
   * GET /v1/governance/versions
   * Protocol and pipeline version history from governance_constants.
   * Public — version history is transparency data.
   */
  app.get('/versions', {
    schema: {
      tags: ['governance'],
      summary: 'FHP protocol and pipeline version history',
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const [constants, history] = await Promise.all([
      app.db`
        SELECT key, value
        FROM config.governance_constants
        WHERE key IN ('FHP_VERSION', 'PIPELINE_VERSION')
        ORDER BY key
      `,
      app.db`
        SELECT fhp_version, released_at::text, label, status, changelog_url
        FROM config.protocol_versions
        ORDER BY released_at DESC
      `,
    ]);

    const versionMap: Record<string, string> = {};
    for (const row of constants as any[]) {
      versionMap[row.key] = row.value;
    }

    return reply.send({
      current: {
        fhp_version:      versionMap['FHP_VERSION'] ?? '1.0.0',
        pipeline_version: versionMap['PIPELINE_VERSION'] ?? '1.0.0',
      },
      history,
    });
  });

  /**
   * GET /v1/governance/bodies
   * Returns the three standing governance bodies with live counts derived from
   * escalations, appeals, and pending votes. Public — no auth required.
   */
  app.get('/bodies', {
    schema: {
      tags: ['governance'],
      summary: 'Standing governance bodies with open item counts and upcoming queue',
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {

    const [bodies, escCounts, appealCounts, openVotes, escQueue] = await Promise.all([
      app.db`
        SELECT body_code, full_name, acronym, member_count, membership_type, current_status, description
        FROM config.governance_bodies
        ORDER BY CASE body_code WHEN 'pc' THEN 1 WHEN 'fob' THEN 2 WHEN 'twg' THEN 3 END
      `,
      app.db`
        SELECT assignee_body, COUNT(*)::int AS cnt
        FROM matching.escalations
        WHERE status NOT IN ('resolved')
        GROUP BY assignee_body
      `,
      app.db`
        SELECT status, COUNT(*)::int AS cnt
        FROM matching.appeals
        WHERE status IN ('twg_review', 'pc_review', 'fob_review')
        GROUP BY status
      `,
      app.db`
        SELECT COUNT(*)::int AS cnt FROM matching.governance_votes WHERE result = 'pending'
      `,
      app.db`
        SELECT assignee_body, json_agg(item ORDER BY deadline ASC NULLS LAST) AS items
        FROM (
          SELECT
            assignee_body,
            json_build_object(
              'ref',      LEFT(escalation_id::text, 8),
              'type',     escalation_type,
              'label',    LEFT(COALESCE(public_summary, outcome_notes, escalation_type), 50),
              'deadline', resolution_deadline
            ) AS item,
            resolution_deadline AS deadline,
            ROW_NUMBER() OVER (PARTITION BY assignee_body ORDER BY resolution_deadline ASC NULLS LAST) AS rn
          FROM matching.escalations
          WHERE status NOT IN ('resolved')
        ) sub
        WHERE rn <= 2
        GROUP BY assignee_body
      `,
    ]);

    const escMap     = Object.fromEntries((escCounts     as any[]).map(r => [r.assignee_body, r.cnt]));
    const appealMap  = Object.fromEntries((appealCounts  as any[]).map(r => [r.status, r.cnt]));
    const queueMap   = Object.fromEntries((escQueue      as any[]).map(r => [r.assignee_body, r.items]));

    const escKey:    Record<string, string> = { pc: 'protocol_council', fob: 'fairness_oversight_board', twg: 'twg' };
    const appStatus: Record<string, string> = { pc: 'pc_review', fob: 'fob_review', twg: 'twg_review' };

    const result = (bodies as any[]).map(b => {
      const ek = escKey[b.body_code as string] ?? '';
      const as = appStatus[b.body_code as string] ?? '';
      return {
        ...b,
        open_item_count: (escMap[ek] ?? 0) + (appealMap[as] ?? 0),
        open_votes:      b.body_code === 'pc' ? (openVotes[0] as any)?.cnt ?? 0 : 0,
        queue_items:     queueMap[ek] ?? [],
      };
    });

    return reply.send({ bodies: result });
  });
}
