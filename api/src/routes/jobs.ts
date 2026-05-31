import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCompany, requireCandidate, requireGovernance } from '../middleware/auth.ts';
import {
  NotFoundError, ValidationError, ConflictError,
  JobBriefNotActiveError, CompanyNotActiveError, AppealWindowExpiredError,
  DuplicateAppealError
} from '../errors/index.ts';
import { rejectHtml } from '../utils/validation.ts';

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
          response_sla_days:       { type: 'integer', minimum: 1, maximum: 10, default: 10 },
          max_notice_period_days:  { type: 'integer', minimum: 0, nullable: true },
          process_stages:          { type: 'array' },
          expires_at:              { type: 'string', format: 'date-time' },
          required_certifications: {
            type: 'array',
            items: {
              type: 'object',
              required: ['cert_id', 'requirement'],
              properties: {
                cert_id:     { type: 'string', description: 'e.g. fhp:cert:driving-licence-b' },
                requirement: { type: 'string', enum: ['must_have', 'preferred'] },
              },
            },
          },
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

    rejectHtml(body.title as string,        'title');
    rejectHtml(body.role_summary as string, 'role_summary');

    // Validate certification IDs against config.certifications
    if (body.required_certifications && (body.required_certifications as any[]).length > 0) {
      const certIds = (body.required_certifications as any[]).map((c: any) => c.cert_id as string);
      const validCerts = await app.db`SELECT cert_id FROM config.certifications WHERE cert_id = ANY(${certIds}) AND active = TRUE`;
      const validCertSet = new Set(validCerts.map((r: any) => r.cert_id as string));
      const invalidCerts = certIds.filter(id => !validCertSet.has(id));
      if (invalidCerts.length > 0) {
        throw new ValidationError(`Unknown certification ID(s): ${invalidCerts.join(', ')}`);
      }
    }

    // Validate skill ontology IDs against config.skills
    const skillIds = (body.skills_required as any[]).map((s: any) => s.ontology_id as string);
    const validSkills = await app.db`SELECT skill_id FROM config.skills WHERE skill_id = ANY(${skillIds}) AND active = TRUE`;
    const validSet = new Set(validSkills.map((r: any) => r.skill_id as string));
    const invalidSkills = skillIds.filter(id => !validSet.has(id));
    if (invalidSkills.length > 0) {
      throw new ValidationError(`Unknown skill ontology ID(s): ${invalidSkills.join(', ')}`);
    }

    const expiresAt = body.expires_at
      ? new Date(body.expires_at as string)
      : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // default 90 days

    if (expiresAt <= new Date()) {
      throw new ValidationError('expires_at must be in the future');
    }

    const allAttested = body.attest_no_degree_requirement === true
      && body.attest_no_institution_preference === true
      && body.attest_no_graduation_year_filter === true
      && body.attest_no_unpaid_work === true;

    const rows = await app.db`
      INSERT INTO matching.job_briefs (
        company_id, fhp_version, title, role_summary, skills_required,
        required_certifications,
        salary_currency, salary_minimum, salary_maximum,
        salary_period, work_mode, location_country, location_region, location_city,
        employment_type, response_sla_days, max_notice_period_days, process_stages, expires_at,
        attest_no_degree_requirement, attest_no_institution_preference,
        attest_no_graduation_year_filter, attest_no_unpaid_work,
        status, activated_at
      ) VALUES (
        ${companyId}, '1.0.0', ${body.title}, ${body.role_summary},
        ${app.db.json(body.skills_required)},
        ${app.db.json((body.required_certifications as any) ?? [])},
        ${body.salary_currency}, ${body.salary_minimum}, ${body.salary_maximum},
        ${body.salary_period ?? 'annual'}, ${body.work_mode},
        ${body.location_country}, ${body.location_region ?? null}, ${body.location_city ?? null},
        ${body.employment_type}, ${body.response_sla_days ?? 10},
        ${body.max_notice_period_days ?? null},
        ${body.process_stages ? app.db.json(body.process_stages) : null},
        ${expiresAt},
        ${body.attest_no_degree_requirement ?? false},
        ${body.attest_no_institution_preference ?? false},
        ${body.attest_no_graduation_year_filter ?? false},
        ${body.attest_no_unpaid_work ?? false},
        ${allAttested ? 'active' : 'draft'},
        ${allAttested ? new Date() : null}
      )
      RETURNING *
    `;

    const newJob = rows[0];

    // When a brief is immediately active (all attestations provided), kick off
    // auto-matching against all eligible candidates. Fire-and-forget — the HTTP
    // response is not held waiting for pipeline runs to complete.
    // Fire-and-forget: auto-match eligible candidates. The NOT EXISTS guard in
    // triggerJobMatching means duplicate pairs are skipped idempotently.
    if (allAttested) {
      setTimeout(() => {
        import('../services/matching-service.ts').then(({ triggerJobMatching }) => {
          triggerJobMatching(app, newJob!.job_id as string, companyId);
        });
      });
    }

    return reply.status(201).send(newJob);
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

    rejectHtml(body.title,        'title');
    rejectHtml(body.role_summary, 'role_summary');

    const rows = await app.db`
      UPDATE matching.job_briefs SET
        title             = COALESCE(${body.title             ?? null}, title),
        role_summary      = COALESCE(${body.role_summary      ?? null}, role_summary),
        employment_type   = COALESCE(${body.employment_type   ?? null}, employment_type),
        work_mode         = COALESCE(${body.work_mode         ?? null}, work_mode),
        salary_currency   = COALESCE(${body.salary_currency   ?? null}, salary_currency),
        salary_minimum    = COALESCE(${body.salary_minimum    ?? null}, salary_minimum),
        salary_maximum    = COALESCE(${body.salary_maximum    ?? null}, salary_maximum),
        salary_period     = COALESCE(${body.salary_period     ?? null}, salary_period),
        location_country  = COALESCE(${body.location_country  ?? null}, location_country),
        location_city     = COALESCE(${body.location_city     ?? null}, location_city),
        response_sla_days       = COALESCE(${body.response_sla_days ?? null}, response_sla_days),
        max_notice_period_days  = COALESCE(${body.max_notice_period_days ?? null}, max_notice_period_days),
        skills_required              = COALESCE(${body.skills_required ? app.db.json(body.skills_required) : null}, skills_required),
        required_certifications      = COALESCE(${body.required_certifications ? app.db.json(body.required_certifications) : null}, required_certifications),
        process_stages               = COALESCE(${body.process_stages ? app.db.json(body.process_stages) : null}, process_stages),
        attest_no_degree_requirement    = COALESCE(${body.attest_no_degree_requirement    ?? null}, attest_no_degree_requirement),
        attest_no_institution_preference = COALESCE(${body.attest_no_institution_preference ?? null}, attest_no_institution_preference),
        attest_no_graduation_year_filter = COALESCE(${body.attest_no_graduation_year_filter ?? null}, attest_no_graduation_year_filter),
        attest_no_unpaid_work           = COALESCE(${body.attest_no_unpaid_work           ?? null}, attest_no_unpaid_work),
        updated_at        = NOW()
      WHERE job_id = ${jobId} AND company_id = ${companyId}
      RETURNING *
    `;
    const updatedJob = rows[0];

    // Re-run auto-matching for candidates not yet matched against this job.
    //
    // Design decision: on edit we run only for *unmatched* candidates.
    // Candidates who already have a match record (any decision) keep their
    // existing result — the pipeline ran against the brief as it was at that
    // moment, and re-scoring would silently change outcomes they may have
    // already seen or appealed. If a candidate believes an edit materially
    // affected their result, the appeal mechanism is the correct remedy.
    //
    // We fire on every edit rather than only on matching-relevant field changes
    // (skills, salary, work_mode) because the cost of an extra pipeline run for
    // a candidate pool that passes the skill-overlap pre-filter is low, and
    // conditional logic on which fields changed adds complexity with little gain.
    setTimeout(() => {
      import('../services/matching-service.ts').then(({ triggerJobMatching }) => {
        triggerJobMatching(app, jobId, companyId);
      });
    });

    return reply.send(updatedJob);
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
