import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCompany, requireCandidate, requireGovernance } from '../middleware/auth.ts';
import {
  NotFoundError, ValidationError, ConflictError,
  JobBriefNotActiveError, CompanyNotActiveError, AppealWindowExpiredError,
  DuplicateAppealError
} from '../errors/index.ts';

export async function appealRoutes(app: FastifyInstance): Promise<void> {

  /** POST /v1/candidates/me/appeals */
  app.post('/candidates/me/appeals', {
    preHandler: [requireCandidate],
    schema: {
      tags: ['appeals'], summary: 'Submit an appeal', security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['match_id', 'ground', 'detail'],
        properties: {
          match_id: { type: 'string', format: 'uuid' },
          ground:   { type: 'string', enum: ['incorrect_skill_assessment','preference_mismatch','suspected_bias'] },
          detail:   { type: 'string', minLength: 20, maxLength: 2000 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId = (request.user as any).candidateId as string;
    const body = request.body as { match_id: string; ground: string; detail: string };

    // Verify match belongs to candidate and get submission deadline
    const match = await app.db`
      SELECT match_id, job_id, created_at,
             (created_at + INTERVAL '30 days') AS appeal_deadline
      FROM matching.match_events
      WHERE match_id = ${body.match_id} AND candidate_id = ${candidateId}
      LIMIT 1
    `;
    if (!match[0]) throw new NotFoundError('Match', body.match_id);

    // Check appeal window
    if (match[0].appeal_deadline && new Date(match[0].appeal_deadline as string) < new Date()) {
      throw new AppealWindowExpiredError();
    }

    // Check for existing appeal
    const existing = await app.db`
      SELECT appeal_id, status FROM matching.appeals
      WHERE match_id = ${body.match_id} AND status NOT IN ('withdrawn')
      LIMIT 1
    `;
    if (existing[0]) throw new DuplicateAppealError();

    const submissionDeadline = new Date((match[0].created_at as Date).getTime() + 30 * 24 * 60 * 60 * 1000);
    const twgDeadline        = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 business days approx

    const rows = await app.db`
      INSERT INTO matching.appeals (
        match_id, candidate_id, job_id, ground, detail,
        status, outcome, submission_deadline, twg_deadline, twg_assigned_at
      ) VALUES (
        ${body.match_id}, ${candidateId}, ${match[0].job_id as string},
        ${body.ground}, ${body.detail}, 'twg_review', 'pending',
        ${submissionDeadline}, ${twgDeadline}, NOW()
      )
      RETURNING appeal_id, match_id, ground, status, submitted_at, twg_deadline
    `;

    // Create escalation record
    await app.db`
      INSERT INTO matching.escalations (
        escalation_type, subject_entity_type, subject_entity_id,
        linked_appeal_id, priority, assignee_body, status, resolution_deadline
      ) VALUES (
        'candidate_appeal', 'match', ${body.match_id},
        ${rows[0]!.appeal_id as string}, 'standard', 'twg',
        'open', ${twgDeadline}
      )
    `;

    return reply.status(201).send(rows[0]);
  });

  /** GET /v1/candidates/me/appeals/:appealId */
  app.get('/candidates/me/appeals/:appealId', {
    preHandler: [requireCandidate],
    schema: {
      tags: ['appeals'], summary: 'Get appeal status', security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { appealId: { type: 'string', format: 'uuid' } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const candidateId  = (request.user as any).candidateId as string;
    const { appealId } = request.params as { appealId: string };

    const rows = await app.db`
      SELECT appeal_id, match_id, ground, detail, status, outcome,
             twg_finding, pc_decision, submitted_at, resolved_at, twg_deadline
      FROM matching.appeals
      WHERE appeal_id = ${appealId} AND candidate_id = ${candidateId}
      LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundError('Appeal', appealId);
    return reply.send(rows[0]);
  });
}
