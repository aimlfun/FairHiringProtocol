/**
 * FHP API — Candidate Routes
 *
 * GET    /v1/candidates/me              — own profile
 * PUT    /v1/candidates/me              — update profile
 * GET    /v1/candidates/me/export       — GDPR data export (Art. 15 + 20)
 * DELETE /v1/candidates/me              — pseudonymisation-on-deletion (Art. 17)
 * GET    /v1/candidates/me/matches      — match history
 * GET    /v1/candidates/me/matches/:id  — single match + explanation
 * GET    /v1/candidates/me/matches/:id/trace — pipeline trace (appeal support)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCandidate }                                    from '../middleware/auth.ts';
import { NotFoundError, ValidationError, ForbiddenError }     from '../errors/index.ts';
import { v4 as uuidv4 }                                        from 'uuid';

export async function candidateRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/candidates/me
   * Returns the authenticated candidate's profile (no PII — that's in identity schema).
   */
  app.get('/me', {
    preHandler: [requireCandidate],
    schema: {
      tags:    ['candidates'],
      summary: 'Get own candidate profile',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            candidate_id:      { type: 'string', format: 'uuid' },
            fhp_version:       { type: 'string' },
            skills:            { type: 'array' },
            work_history:      { type: 'array' },
            preferences:       { type: 'object', additionalProperties: true },
            privacy:           { type: 'object', additionalProperties: true },
            matching_eligible: { type: 'boolean' },
            profile_strength:  { type: 'number' },
            created_at:        { type: 'string' },
            updated_at:        { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;

    const rows = await app.db`
      SELECT
        candidate_id, fhp_version, skills, work_history,
        preferences, privacy, status, matching_eligible,
        profile_strength, created_at, updated_at
      FROM matching.candidate_profiles
      WHERE candidate_id = ${candidateId}
        AND status != 'deleted'
    `;

    if (!rows[0]) throw new NotFoundError('Candidate profile', candidateId);

    return reply.send(rows[0]);
  });

  /**
   * PUT /v1/candidates/me
   * Update skills, preferences, privacy settings, work history.
   */
  app.put('/me', {
    preHandler: [requireCandidate],
    schema: {
      tags:    ['candidates'],
      summary: 'Update candidate profile',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          skills:       { type: 'array' },
          work_history: { type: 'array' },
          preferences:  { type: 'object' },
          privacy:      { type: 'object' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;
    const body        = request.body as {
      skills?:       unknown[];
      work_history?: unknown[];
      preferences?:  Record<string, unknown>;
      privacy?:      Record<string, unknown>;
    };

    // Build update dynamically — only update provided fields.
    // postgres.js requires JSON values to be wrapped in app.db.json() so the
    // driver sends them with the correct jsonb type binding rather than as text.
    const skillsVal      = body.skills       ? app.db.json(body.skills)       : null;
    const workHistoryVal = body.work_history ? app.db.json(body.work_history) : null;
    const prefsVal       = body.preferences  ? app.db.json(body.preferences)  : null;
    const privacyVal     = body.privacy      ? app.db.json(body.privacy)      : null;

    // Auto-manage matching_eligible based on skills presence.
    // null = skills not provided in this request → keep current DB value.
    const eligibleVal: boolean | null = body.skills !== undefined
      ? (Array.isArray(body.skills) && body.skills.length > 0)
      : null;

    const rows = await app.db`
      UPDATE matching.candidate_profiles
      SET
        skills            = COALESCE(${skillsVal},      skills),
        work_history      = COALESCE(${workHistoryVal}, work_history),
        preferences       = COALESCE(${prefsVal},       preferences),
        privacy           = COALESCE(${privacyVal},     privacy),
        matching_eligible = COALESCE(${eligibleVal}, matching_eligible),
        updated_at        = NOW()
      WHERE candidate_id = ${candidateId}
        AND status != 'deleted'
      RETURNING candidate_id, skills, work_history, preferences, privacy, matching_eligible,
                profile_strength, updated_at
    `;

    if (!rows[0]) throw new NotFoundError('Candidate profile', candidateId);

    return reply.send(rows[0]);
  });

  /**
   * GET /v1/candidates/me/export
   * GDPR Art. 15 (access) + Art. 20 (portability) — full data export in FHP JSON format.
   *
   * Accepts the JWT via the standard Authorization header OR as a ?token= query parameter.
   * The query-parameter form exists solely to support browser window.location.href navigation
   * (which cannot carry custom headers), so the browser's native download handler receives
   * the Content-Disposition filename directly rather than relying on the JS download attribute.
   */
  app.get('/me/export', {
    preHandler: [
      async (request: FastifyRequest, reply: FastifyReply) => {
        const q = request.query as { token?: string };
        if (q.token && !request.headers.authorization) {
          (request.headers as Record<string, string>).authorization = `Bearer ${q.token}`;
        }
        return requireCandidate(request, reply);
      },
    ],
    schema: {
      tags:    ['candidates'],
      summary: 'Export all candidate data (GDPR Art. 15 + 20)',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: { token: { type: 'string' } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;

    // Fetch everything in parallel
    const [profileRows, identityRows, matchRows, appealRows] = await Promise.all([
      app.db`
        SELECT * FROM matching.candidate_profiles
        WHERE candidate_id = ${candidateId}
      `,
      app.identityDb`
        SELECT contact_email, preferred_language, created_at
        FROM identity.candidate_identity
        WHERE candidate_id = ${candidateId}
      `,
      app.db`
        SELECT me.match_id, me.job_id, me.decision, me.overall_score,
               me.created_at, expl.plain_language_summary, expl.skill_breakdown,
               expl.scores_snapshot, expl.not_matched_reasons, expl.next_steps
        FROM matching.match_events me
        LEFT JOIN matching.match_explanations expl
          ON expl.match_id = me.match_id AND expl.audience = 'candidate'
        WHERE me.candidate_id = ${candidateId}
        ORDER BY me.created_at DESC
      `,
      app.db`
        SELECT appeal_id, match_id, ground, detail, status, outcome,
               submitted_at, resolved_at
        FROM matching.appeals
        WHERE candidate_id = ${candidateId}
        ORDER BY submitted_at DESC
      `,
    ]);

    const exportData = {
      export_generated_at:   new Date().toISOString(),
      fhp_schema_version:    '1.0.0',
      gdpr_basis:            'Article 15 (access) and Article 20 (portability)',
      candidate_id:          candidateId,
      identity: identityRows[0] ?? null,
      profile:  profileRows[0]  ?? null,
      matches:  matchRows,
      appeals:  appealRows,
    };

    // Log the data subject access request
    await app.db`
      INSERT INTO audit.data_subject_requests
        (candidate_ref, request_type, channel, status, completed_at, updated_at)
      VALUES
        (${candidateId}, 'access', 'in_app', 'completed', NOW(), NOW())
    `;

    const exportDate = new Date().toISOString().slice(0, 10);
    return reply
      .header('Content-Disposition', `attachment; filename="fhp-export-${exportDate}.json"`)
      .header('Content-Type', 'application/json')
      .send(exportData);
  });

  /**
   * DELETE /v1/candidates/me
   * GDPR Art. 17 — right to erasure via pseudonymisation procedure.
   * See legal/pseudonymisation-procedure.md
   */
  app.delete('/me', {
    preHandler: [requireCandidate],
    schema: {
      tags:    ['candidates'],
      summary: 'Delete account (GDPR Art. 17 — pseudonymisation procedure)',
      security: [{ bearerAuth: [] }],
      response: { 204: { type: 'null' } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;

    // Check for active appeals — these must be resolved or withdrawn first
    const activeAppeals = await app.db`
      SELECT appeal_id FROM matching.appeals
      WHERE candidate_id = ${candidateId}
        AND status NOT IN ('resolved', 'withdrawn')
      LIMIT 1
    `;

    if (activeAppeals.length > 0) {
      throw new ValidationError(
        'You have an active appeal that must be resolved or withdrawn before deleting your account. ' +
        `Appeal ID: ${activeAppeals[0]!.appeal_id}`
      );
    }

    const replacementId = uuidv4();
    const deletionHash  = await computeSHA256(candidateId);
    const now           = new Date();

    // Execute pseudonymisation as a transaction
    // See legal/pseudonymisation-procedure.md §5 for the full procedure
    await app.db.begin(async (tx) => {

      // Step 1: Pseudonymise all matching schema references
      const tables = [
        { table: 'matching.match_events',         col: 'candidate_id' },
        { table: 'matching.match_explanations',   col: 'candidate_id' },
        { table: 'matching.active_interactions',  col: 'candidate_id' },
        { table: 'matching.appeals',              col: 'candidate_id' },
        { table: 'matching.ghosting_events',      col: 'candidate_id' },
        { table: 'matching.candidate_cohorts',    col: 'candidate_id' },
      ];

      for (const { table, col } of tables) {
        // We use unsafe here because table names cannot be parameterised
        // This is safe because table names are hardcoded, not user-supplied
        await tx.unsafe(`
          UPDATE ${table}
          SET ${col} = $1
          WHERE ${col} = $2
        `, [replacementId, candidateId]);
      }

      // Step 2: Delete the profile
      await tx`
        DELETE FROM matching.candidate_profiles
        WHERE candidate_id = ${candidateId}
      `;

      // Step 3: Mark as deleted in analytical schema (pseudonymise traces)
      await tx.unsafe(`
        UPDATE analytical.pipeline_traces
        SET candidate_id = $1
        WHERE candidate_id = $2
      `, [replacementId, candidateId]);

      // Step 4: Record deletion in audit table (no PII — hash only)
      await tx`
        INSERT INTO audit.deletion_records (
          deletion_hash, replacement_id, trigger_type,
          requested_at, completed_at, deleted_by,
          tables_pseudonymised, identity_deleted,
          auth_deleted, profile_deleted
        ) VALUES (
          ${deletionHash}, ${replacementId}, 'candidate_request',
          ${now}, ${now}, 'fhp_api',
          ARRAY['match_events','match_explanations','active_interactions',
                'appeals','ghosting_events','candidate_cohorts','pipeline_traces'],
          TRUE, TRUE, TRUE
        )
      `;

      // Step 5: Log the data subject request
      await tx`
        INSERT INTO audit.data_subject_requests
          (candidate_ref, request_type, channel, status, completed_at, updated_at)
        VALUES
          (${replacementId}, 'erasure', 'in_app', 'completed', ${now}, ${now})
      `;
    });

    // Step 6: Delete PII from identity schema (separate pool — after main transaction)
    await app.identityDb`
      DELETE FROM identity.candidate_auth     WHERE candidate_id = ${candidateId}
    `;
    await app.identityDb`
      DELETE FROM identity.candidate_identity WHERE candidate_id = ${candidateId}
    `;

    request.log.info({ replacementId, deletionHash }, 'Candidate account pseudonymised');

    return reply.status(204).send();
  });

  /**
   * GET /v1/candidates/me/matches
   * Paginated match history with outcome and score summary.
   */
  app.get('/me/matches', {
    preHandler: [requireCandidate],
    schema: {
      tags:    ['candidates'],
      summary: 'Get match history',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page:     { type: 'integer', minimum: 1, default: 1 },
          limit:    { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          decision: { type: 'string', enum: ['matched', 'not_matched', 'borderline'] },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;
    const query       = request.query as { page: number; limit: number; decision?: string };
    const offset      = (query.page - 1) * query.limit;

    const rows = await app.db`
      SELECT
        me.match_id,
        me.job_id,
        me.decision,
        me.overall_score::float AS overall_score,
        me.bias_correction_triggered,
        me.appeal_eligible,
        (me.created_at + INTERVAL '30 days') AS appeal_deadline,
        me.created_at,
        jb.title         AS job_title,
        jb.work_mode,
        jb.location_city,
        jb.location_country,
        jb.salary_minimum,
        jb.salary_maximum,
        jb.salary_currency,
        expl.plain_language_summary
      FROM matching.match_events me
      JOIN matching.job_briefs jb ON jb.job_id = me.job_id
      LEFT JOIN matching.match_explanations expl
        ON expl.match_id = me.match_id AND expl.audience = 'candidate'
      WHERE me.candidate_id = ${candidateId}
        ${query.decision ? app.db`AND me.decision = ${query.decision}` : app.db``}
      ORDER BY me.created_at DESC
      LIMIT ${query.limit} OFFSET ${offset}
    `;

    const countRow = await app.db`
      SELECT COUNT(*)::int AS total
      FROM matching.match_events
      WHERE candidate_id = ${candidateId}
        ${query.decision ? app.db`AND decision = ${query.decision}` : app.db``}
    `;

    return reply.send({
      matches:  rows,
      total:    countRow[0]?.total ?? 0,
      page:     query.page,
      limit:    query.limit,
    });
  });

  /**
   * GET /v1/candidates/me/matches/:matchId
   * Full match result with candidate-audience explanation.
   */
  app.get('/me/matches/:matchId', {
    preHandler: [requireCandidate],
    schema: {
      tags:    ['candidates'],
      summary: 'Get a single match with full explanation',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['matchId'],
        properties: { matchId: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;
    const { matchId } = request.params as { matchId: string };

    const rows = await app.db`
      SELECT
        me.match_id, me.job_id, me.decision, me.overall_score,
        me.pre_correction_score, me.skill_score, me.preference_alignment_score,
        me.bias_correction_triggered, me.bias_correction_delta,
        me.appeal_eligible, (me.created_at + INTERVAL '30 days') AS appeal_deadline, me.created_at,
        jb.title AS job_title, jb.company_id, jb.work_mode,
        jb.location_city, jb.location_country,
        jb.salary_minimum, jb.salary_maximum, jb.salary_currency,
        expl.explanation_id, expl.plain_language_summary,
        expl.skill_breakdown, expl.scores_snapshot, expl.not_matched_reasons,
        expl.next_steps, expl.bias_assessment
      FROM matching.match_events me
      JOIN matching.job_briefs jb ON jb.job_id = me.job_id
      LEFT JOIN matching.match_explanations expl
        ON expl.match_id = me.match_id AND expl.audience = 'candidate'
      WHERE me.match_id    = ${matchId}
        AND me.candidate_id = ${candidateId}
    `;

    if (!rows[0]) throw new NotFoundError('Match', matchId);

    return reply.send(rows[0]);
  });

  /**
   * GET /v1/candidates/me/matches/:matchId/trace
   * Pipeline trace — provided to support appeal submissions.
   * Returns a simplified view (full governance trace requires governance role).
   */
  app.get('/me/matches/:matchId/trace', {
    preHandler: [requireCandidate],
    schema: {
      tags:    ['candidates'],
      summary: 'Get pipeline trace for a match (appeal support)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['matchId'],
        properties: { matchId: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;
    const { matchId } = request.params as { matchId: string };

    // Verify the match belongs to this candidate
    const matchCheck = await app.db`
      SELECT match_id FROM matching.match_events
      WHERE match_id = ${matchId} AND candidate_id = ${candidateId}
      LIMIT 1
    `;
    if (!matchCheck[0]) throw new NotFoundError('Match', matchId);

    const traces = await app.db`
      SELECT
        trace_id, match_id, pipeline_version,
        started_at, completed_at, duration_ms, status,
        -- Stage summaries for candidates (name, status, duration only)
        -- Full trace_data is available to governance via /governance/traces/:id
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object(
            'stage_name',  s->>'stage_name',
            'status',      s->>'status',
            'duration_ms', (s->>'duration_ms')::int
          ))
          FROM jsonb_array_elements(trace_data->'stages') s),
          '[]'::jsonb
        ) AS stages,
        under_appeal
      FROM analytical.pipeline_traces
      WHERE match_id    = ${matchId}
        AND candidate_id = ${candidateId}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!traces[0]) throw new NotFoundError('Trace for match', matchId);

    return reply.send(traces[0]);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function computeSHA256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data    = encoder.encode(input);
  const hash    = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
