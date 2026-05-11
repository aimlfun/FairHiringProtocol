import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCompany, requireCandidate, requireGovernance } from '../middleware/auth.ts';
import {
  NotFoundError, ValidationError, ConflictError,
  JobBriefNotActiveError, CompanyNotActiveError, AppealWindowExpiredError,
  DuplicateAppealError
} from '../errors/index.ts';

export async function jobRoutes(app: FastifyInstance): Promise<void> {

  /** POST /v1/jobs — company creates a new job brief */
  app.post('/', {
    preHandler: [requireCompany],
    schema: { tags: ['jobs'], summary: 'Create a new job brief', security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['title','role_summary','skills_required','salary_currency',
                   'salary_minimum','salary_maximum','work_mode','location_country','employment_type'],
        properties: {
          title:           { type: 'string', maxLength: 128 },
          role_summary:    { type: 'string', maxLength: 2000 },
          skills_required: {
            type: 'array', minItems: 1,
            items: {
              type: 'object',
              required: ['ontology_id','label','requirement_type','min_proficiency'],
              properties: {
                ontology_id:      { type: 'string', description: 'e.g. fhp:skill:python' },
                label:            { type: 'string' },
                domain:           { type: 'string' },
                requirement_type: { type: 'string', enum: ['must_have','nice_to_have'] },
                min_proficiency:  { type: 'string', enum: ['aware','practitioner','proficient','expert','authority'] },
              },
            },
          },
          salary_currency: { type: 'string', pattern: '^[A-Z]{3}$' },
          salary_minimum:  { type: 'number', minimum: 0 },
          salary_maximum:  { type: 'number', minimum: 0 },
          salary_period:   { type: 'string', enum: ['annual','daily','hourly'], default: 'annual' },
          work_mode:       { type: 'string', enum: ['remote','hybrid','on_site'] },
          location_country:{ type: 'string', pattern: '^[A-Z]{2}$' },
          location_region: { type: 'string' },
          location_city:   { type: 'string' },
          employment_type: { type: 'string', enum: ['permanent','contract','part_time','internship','apprenticeship'] },
          response_sla_days:{ type: 'integer', minimum: 1, maximum: 10, default: 10 },
          process_stages:  { type: 'array' },
          expires_at:      { type: 'string', format: 'date-time' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId = (request.user as any).companyId as string;
    const body = request.body as any;

    // Verify company is active
    const company = await app.db`
      SELECT status FROM matching.companies WHERE company_id = ${companyId} LIMIT 1
    `;
    if (!company[0]) throw new NotFoundError('Company', companyId);
    if (company[0].status !== 'active') throw new CompanyNotActiveError(company[0].status as string);

    if (body.salary_maximum < body.salary_minimum) {
      throw new ValidationError('salary_maximum must be greater than or equal to salary_minimum');
    }

    const expiresAt = body.expires_at
      ? new Date(body.expires_at as string)
      : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // default 90 days

    if (expiresAt <= new Date()) {
      throw new ValidationError('expires_at must be in the future');
    }

    const rows = await app.db`
      INSERT INTO matching.job_briefs (
        company_id, fhp_version, title, role_summary, skills_required,
        salary_currency, salary_minimum, salary_maximum,
        salary_period, work_mode, location_country, location_region, location_city,
        employment_type, response_sla_days, process_stages, expires_at
      ) VALUES (
        ${companyId}, '1.0.0', ${body.title}, ${body.role_summary},
        ${app.db.json(body.skills_required)},
        ${body.salary_currency}, ${body.salary_minimum}, ${body.salary_maximum},
        ${body.salary_period ?? 'annual'}, ${body.work_mode},
        ${body.location_country}, ${body.location_region ?? null}, ${body.location_city ?? null},
        ${body.employment_type}, ${body.response_sla_days ?? 10},
        ${body.process_stages ? app.db.json(body.process_stages) : null},
        ${expiresAt}
      )
      RETURNING *
    `;

    return reply.status(201).send(rows[0]);
  });

  /** GET /v1/jobs/:jobId */
  app.get('/:jobId', {
    schema: { tags: ['jobs'], summary: 'Get a job brief',
      params: { type: 'object', properties: { jobId: { type: 'string', format: 'uuid' } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = request.params as { jobId: string };
    const rows = await app.db`
      SELECT * FROM matching.job_briefs WHERE job_id = ${jobId} AND status = 'active'
    `;
    if (!rows[0]) throw new NotFoundError('Job brief', jobId);
    return reply.send(rows[0]);
  });

  /** PUT /v1/jobs/:jobId — company updates their job brief */
  app.put('/:jobId', {
    preHandler: [requireCompany],
    schema: { tags: ['jobs'], summary: 'Update a job brief', security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { jobId: { type: 'string', format: 'uuid' } } },
      body: { type: 'object', additionalProperties: true },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId = (request.user as any).companyId as string;
    const { jobId } = request.params as { jobId: string };
    const body = request.body as any;

    const check = await app.db`
      SELECT job_id FROM matching.job_briefs
      WHERE job_id = ${jobId} AND company_id = ${companyId}
        AND status NOT IN ('filled','cancelled','expired')
      LIMIT 1
    `;
    if (!check[0]) throw new NotFoundError('Job brief', jobId);

    const rows = await app.db`
      UPDATE matching.job_briefs SET
        title          = COALESCE(${body.title          ?? null}, title),
        role_summary   = COALESCE(${body.role_summary   ?? null}, role_summary),
        salary_minimum = COALESCE(${body.salary_minimum ?? null}, salary_minimum),
        salary_maximum = COALESCE(${body.salary_maximum ?? null}, salary_maximum),
        process_stages = COALESCE(${body.process_stages ? app.db.json(body.process_stages) : null}, process_stages),
        updated_at     = NOW()
      WHERE job_id = ${jobId} AND company_id = ${companyId}
      RETURNING *
    `;
    return reply.send(rows[0]);
  });

  /** GET /v1/jobs/:jobId/matches — company sees matches for their job */
  app.get('/:jobId/matches', {
    preHandler: [requireCompany],
    schema: { tags: ['jobs'], summary: 'Get matches for a job brief', security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { jobId: { type: 'string', format: 'uuid' } } },
      querystring: {
        type: 'object',
        properties: {
          decision: { type: 'string', enum: ['matched','borderline'] },
          page:     { type: 'integer', minimum: 1, default: 1 },
          limit:    { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const companyId = (request.user as any).companyId as string;
    const { jobId } = request.params as { jobId: string };
    const query     = request.query as { decision?: string; page: number; limit: number };
    const offset    = (query.page - 1) * query.limit;

    // Verify job belongs to company
    const check = await app.db`
      SELECT job_id FROM matching.job_briefs
      WHERE job_id = ${jobId} AND company_id = ${companyId} LIMIT 1
    `;
    if (!check[0]) throw new NotFoundError('Job brief', jobId);

    // Employer sees employer-audience explanations only (no candidate PII, no bias detail)
    const rows = await app.db`
      SELECT
        me.match_id, me.overall_score, me.decision, me.created_at,
        expl.skill_breakdown, expl.scores_snapshot, expl.plain_language_summary
      FROM matching.match_events me
      LEFT JOIN matching.match_explanations expl
        ON expl.match_id = me.match_id AND expl.audience = 'employer'
      WHERE me.job_id     = ${jobId}
        AND me.company_id = ${companyId}
        ${query.decision ? app.db`AND me.decision = ${query.decision}` : app.db``}
      ORDER BY me.overall_score DESC, me.created_at DESC
      LIMIT ${query.limit} OFFSET ${offset}
    `;

    return reply.send({ matches: rows, page: query.page, limit: query.limit });
  });
}
