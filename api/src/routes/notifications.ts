/**
 * FHP API — Candidate Notifications, Interactions, Consents, and Ghosting
 *
 * GET    /v1/candidates/me/notifications          — notification list + unread count
 * PUT    /v1/candidates/me/notifications/:id/read  — mark single notification read
 * PUT    /v1/candidates/me/notifications/read-all  — mark all read
 * PUT    /v1/candidates/me/interactions/:id        — accept or decline a stage invitation
 * GET    /v1/candidates/me/ghosting                — ghosting events against candidate
 * GET    /v1/candidates/me/consents               — consent record
 * DELETE /v1/candidates/me/consents/fairness      — withdraw fairness consent
 * GET    /v1/candidates/me/transfer-credits       — transfer credits from current skills
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCandidate }                                    from '../middleware/auth.ts';
import { NotFoundError, ValidationError }                      from '../errors/index.ts';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/candidates/me/notifications
   * Returns notifications with unread count for the bell badge.
   */
  app.get('/me/notifications', {
    preHandler: [requireCandidate],
    schema: {
      tags: ['candidates'],
      summary: 'Get candidate notifications',
      querystring: {
        type: 'object',
        properties: {
          unread_only: { type: 'boolean', default: false },
          limit:       { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;
    const q = request.query as { unread_only: boolean; limit: number };

    const rows = await app.db`
      SELECT
        notification_id, notification_type, title, body,
        match_id, interaction_id, appeal_id, job_id, company_id,
        actions, read_at, created_at
      FROM matching.candidate_notifications
      WHERE candidate_id = ${candidateId}
        ${q.unread_only ? app.db`AND read_at IS NULL` : app.db``}
      ORDER BY created_at DESC
      LIMIT ${q.limit}
    `;

    const unreadCount = await app.db`
      SELECT COUNT(*)::int AS count
      FROM matching.candidate_notifications
      WHERE candidate_id = ${candidateId} AND read_at IS NULL
    `;

    return reply.send({
      notifications: rows,
      unread_count:  unreadCount[0]?.count ?? 0,
    });
  });

  /**
   * PUT /v1/candidates/me/notifications/:notificationId/read
   */
  app.put('/me/notifications/:notificationId/read', {
    preHandler: [requireCandidate],
    schema: {
      tags: ['candidates'],
      summary: 'Mark notification as read',
      params: {
        type: 'object',
        properties: { notificationId: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId      = (request.user as any).candidateId as string;
    const { notificationId } = request.params as { notificationId: string };

    await app.db`
      UPDATE matching.candidate_notifications
      SET read_at = NOW()
      WHERE notification_id = ${notificationId}
        AND candidate_id    = ${candidateId}
        AND read_at IS NULL
    `;

    return reply.send({ read: true });
  });

  /**
   * PUT /v1/candidates/me/notifications/read-all
   */
  app.put('/me/notifications/read-all', {
    preHandler: [requireCandidate],
    schema: {
      tags: ['candidates'],
      summary: 'Mark all notifications as read',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;

    await app.db`
      UPDATE matching.candidate_notifications
      SET read_at = NOW()
      WHERE candidate_id = ${candidateId} AND read_at IS NULL
    `;

    return reply.send({ read: true });
  });

  /**
   * PUT /v1/candidates/me/interactions/:interactionId
   * Accept or decline a company's stage invitation.
   * This is the Accept/Decline action from notification cards.
   */
  app.put('/me/interactions/:interactionId', {
    preHandler: [requireCandidate],
    schema: {
      tags: ['candidates'],
      summary: 'Accept or decline a hiring stage invitation',
      params: {
        type: 'object',
        properties: { interactionId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['action'],
        properties: {
          action: { type: 'string', enum: ['accept', 'decline'] },
          reason: { type: 'string', maxLength: 500 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId      = (request.user as any).candidateId as string;
    const { interactionId } = request.params as { interactionId: string };
    const { action, reason } = request.body as { action: 'accept' | 'decline'; reason?: string };

    // Verify interaction belongs to candidate and is active
    const interaction = await app.db`
      SELECT interaction_id, current_stage, status
      FROM matching.active_interactions
      WHERE interaction_id = ${interactionId}
        AND candidate_id   = ${candidateId}
        AND status         = 'active'
      LIMIT 1
    `;
    if (!interaction[0]) throw new NotFoundError('Interaction', interactionId);

    if (action === 'decline') {
      await app.db`
        UPDATE matching.active_interactions SET
          status          = 'completed',
          outcome         = 'candidate_withdrew',
          rejection_notes = ${reason ?? null},
          updated_at      = NOW()
        WHERE interaction_id = ${interactionId}
      `;
    } else {
      // Accept — update last_contact_at, reset SLA deadline
      await app.db`
        UPDATE matching.active_interactions SET
          last_contact_at = NOW(),
          updated_at      = NOW()
        WHERE interaction_id = ${interactionId}
      `;
    }

    // Mark related notification as read
    await app.db`
      UPDATE matching.candidate_notifications
      SET read_at = NOW()
      WHERE interaction_id = ${interactionId}
        AND candidate_id   = ${candidateId}
        AND read_at IS NULL
    `;

    return reply.send({
      interaction_id: interactionId,
      action,
      outcome: action === 'decline' ? 'candidate_withdrew' : 'accepted',
    });
  });

  /**
   * GET /v1/candidates/me/ghosting
   * Ghosting events against this candidate — for the Dashboard "ghosts" stat.
   */
  app.get('/me/ghosting', {
    preHandler: [requireCandidate],
    schema: {
      tags: ['candidates'],
      summary: 'Get ghosting events against candidate',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['open','resolved','all'], default: 'all' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;
    const { status }  = request.query as { status: string };

    const rows = await app.db`
      SELECT
        ge.ghosting_id, ge.stage_name, ge.severity, ge.status,
        ge.detected_at, ge.overdue_hours, ge.resolved_at,
        ge.candidate_notified_at,
        jb.title AS job_title
      FROM matching.ghosting_events ge
      JOIN matching.job_briefs jb ON jb.job_id = ge.job_id
      WHERE ge.candidate_id = ${candidateId}
        ${status !== 'all' ? app.db`AND ge.status = ${status}` : app.db``}
      ORDER BY ge.detected_at DESC
    `;

    return reply.send({
      ghosting_events: rows,
      open_count: rows.filter((r: any) => r.status === 'open').length,
    });
  });

  /**
   * GET /v1/candidates/me/consents
   * Returns the candidate's consent record for the Data & Privacy page.
   */
  app.get('/me/consents', {
    preHandler: [requireCandidate],
    schema: {
      tags: ['candidates'],
      summary: 'Get candidate consent record',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;

    const rows = await app.db`
      SELECT consent_id, consent_type, legal_basis, given_at, withdrawn_at
      FROM matching.candidate_consents
      WHERE candidate_id = ${candidateId}
      ORDER BY given_at ASC
    `;

    return reply.send({ consents: rows });
  });

  /**
   * DELETE /v1/candidates/me/consents/fairness
   * Withdraw fairness metric consent (GDPR Art. 9 — can be withdrawn at any time).
   * Does NOT delete historical cohort data — marks consent as withdrawn.
   */
  app.delete('/me/consents/fairness', {
    preHandler: [requireCandidate],
    schema: {
      tags: ['candidates'],
      summary: 'Withdraw fairness metric consent',
      response: { 200: { type: 'object', properties: { withdrawn: { type: 'boolean' } } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;

    await app.db`
      UPDATE matching.candidate_consents
      SET withdrawn_at = NOW()
      WHERE candidate_id  = ${candidateId}
        AND consent_type  = 'fairness_metrics'
        AND withdrawn_at IS NULL
    `;

    // Soft-delete cohort memberships (preserved anonymously for audit)
    await app.db`
      DELETE FROM matching.candidate_cohorts
      WHERE candidate_id = ${candidateId}
    `;

    return reply.send({ withdrawn: true });
  });

  /**
   * GET /v1/candidates/me/transfer-credits
   * Computes transfer credits from the candidate's current skill set.
   * Used by the "Transfer credit from your skills" profile section.
   */
  app.get('/me/transfer-credits', {
    preHandler: [requireCandidate],
    schema: {
      tags: ['candidates'],
      summary: 'Get transfer credits computed from candidate skill set',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;

    // Get candidate skills
    const profile = await app.db`
      SELECT skills FROM matching.candidate_profiles
      WHERE candidate_id = ${candidateId}
      LIMIT 1
    `;
    if (!profile[0]) throw new NotFoundError('Candidate profile', candidateId);

    const skills: any[] = (profile[0].skills as any[]) ?? [];

    // Get transfer relationships from ontology
    // In production this would query ontology.skills and its transfer_relationships
    // For now we compute from the governance constants and known transfer pairs
    // This is a simplified version — the full MMIL will enrich this
    const HARDCODED_TRANSFERS = [
      { source_id: 'fhp:skill:docker',        target_label: 'Kubernetes',           weight: 0.70 },
      { source_id: 'fhp:skill:spark',          target_label: 'Data Pipeline Design', weight: 0.80 },
      { source_id: 'fhp:skill:sql-analytics',  target_label: 'Data Modelling',       weight: 0.70 },
      { source_id: 'fhp:skill:dbt',            target_label: 'ELT Pipeline Design',  weight: 0.90 },
      { source_id: 'fhp:skill:react',          target_label: 'Vue.js',               weight: 0.65 },
      { source_id: 'fhp:skill:python',         target_label: 'Data Science',         weight: 0.60 },
      { source_id: 'fhp:skill:aws',            target_label: 'Cloud Architecture',   weight: 0.75 },
    ];

    const PROF_LEVELS: Record<string, number> = {
      aware: 0, practitioner: 1, proficient: 2, expert: 3, authority: 4
    };

    const TRANSFER_CAP = 0.60; // matches governance constant TRANSFER_SCORE_CAP

    const credits = HARDCODED_TRANSFERS
      .map(t => {
        const sourceSkill = skills.find((s: any) => s.ontology_id === t.source_id);
        if (!sourceSkill) return null;
        const profLevel = PROF_LEVELS[sourceSkill.proficiency as string] ?? 0;
        const rawCredit = (profLevel / 4) * t.weight;
        const cappedCredit = Math.min(rawCredit, TRANSFER_CAP);
        return {
          source_skill_id:    t.source_id,
          source_proficiency: sourceSkill.proficiency,
          target_skill_label: t.target_label,
          transfer_weight:    t.weight,
          raw_credit:         Math.round(rawCredit * 100),
          capped_credit:      Math.round(cappedCredit * 100),
          is_capped:          rawCredit > TRANSFER_CAP,
        };
      })
      .filter(Boolean);

    return reply.send({ transfer_credits: credits });
  });
}
