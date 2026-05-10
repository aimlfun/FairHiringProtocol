/**
 * FHP API — Company Auth Routes
 *
 * POST /v1/auth/register-company  — create company account
 * POST /v1/auth/login-company     — issue company JWT
 *
 * Company auth is distinct from candidate auth:
 *   - Different DB tables (identity.company_auth vs identity.candidate_auth)
 *   - Different JWT claims (companyId vs candidateId, role: 'company')
 *   - Company must accept the Compliance Agreement before posting jobs
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 }                                from 'uuid';
import { ConflictError, UnauthorisedError, ValidationError } from '../errors/index.ts';

const JURISDICTIONS = ['GB','US','DE','FR','NL','IE','AU','CA','SE','DK','NO','FI','SG','AE'];

export async function companyAuthRoutes(app: FastifyInstance): Promise<void> {

  /**
   * POST /v1/auth/register-company
   * Creates a company record and auth credentials.
   * Company is in 'pending_verification' status until compliance agreement accepted.
   */
  app.post('/register-company', {
    schema: {
      tags: ['auth'],
      summary: 'Register a new company account',
      body: {
        type: 'object',
        required: ['legal_name','jurisdiction','compliance_contact_email','password','declared_monthly_roles'],
        additionalProperties: false,
        properties: {
          legal_name:                    { type: 'string', minLength: 2, maxLength: 200 },
          jurisdiction:                  { type: 'string', pattern: '^[A-Z]{2}$' },
          registration_number:           { type: 'string', maxLength: 50 },
          compliance_contact_email:      { type: 'string', format: 'email' },
          compliance_contact_name:       { type: 'string', maxLength: 200 },
          password:                      { type: 'string', minLength: 12, maxLength: 128 },
          declared_monthly_roles:        { type: 'integer', minimum: 1, maximum: 10000 },
          compliance_agreement_accepted: { type: 'boolean' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            company_id:    { type: 'string', format: 'uuid' },
            access_token:  { type: 'string' },
            refresh_token: { type: 'string' },
            status:        { type: 'string' },
          },
        },
      },
    },
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      legal_name:                    string;
      jurisdiction:                  string;
      registration_number?:          string;
      compliance_contact_email:      string;
      compliance_contact_name?:      string;
      password:                      string;
      declared_monthly_roles:        number;
      compliance_agreement_accepted?: boolean;
    };

    if (!JURISDICTIONS.includes(body.jurisdiction)) {
      throw new ValidationError(`Unsupported jurisdiction: ${body.jurisdiction}`);
    }

    // Check for duplicate company
    const existing = await app.db`
      SELECT company_id FROM matching.companies
      WHERE legal_name = ${body.legal_name}
        AND jurisdiction = ${body.jurisdiction}
      LIMIT 1
    `;
    if (existing.length > 0) {
      throw new ConflictError(
        `A company named "${body.legal_name}" is already registered in ${body.jurisdiction}`
      );
    }

    // Check email not already used
    const existingEmail = await app.identityDb`
      SELECT company_id FROM identity.company_auth ca
      JOIN matching.companies c USING (company_id)
      WHERE c.compliance_contact_email = ${body.compliance_contact_email.toLowerCase()}
      LIMIT 1
    `;
    if (existingEmail.length > 0) {
      throw new ConflictError('An account with this email address already exists');
    }

    const companyId    = uuidv4();
    const passwordHash = await bcrypt.hash(body.password, 12);
    const now          = new Date();

    // Create company record
    await app.db`
      INSERT INTO matching.companies (
        company_id, fhp_version, legal_name, jurisdiction,
        registration_number, compliance_contact_name,
        compliance_contact_email, status, declared_monthly_roles,
        compliance_agreement_accepted, compliance_agreement_accepted_at,
        compliance_agreement_version, created_at, updated_at
      ) VALUES (
        ${companyId}, '1.0.0', ${body.legal_name}, ${body.jurisdiction},
        ${body.registration_number ?? null},
        ${body.compliance_contact_name ?? body.compliance_contact_email},
        ${body.compliance_contact_email.toLowerCase()},
        ${body.compliance_agreement_accepted ? 'active' : 'pending_verification'},
        ${body.declared_monthly_roles},
        ${body.compliance_agreement_accepted ?? false},
        ${body.compliance_agreement_accepted ? now : null},
        ${body.compliance_agreement_accepted ? '1.0' : null},
        ${now}, ${now}
      )
    `;

    // Create auth credentials in identity schema
    await app.identityDb`
      INSERT INTO identity.company_auth (
        company_id, password_hash, created_at, updated_at
      ) VALUES (
        ${companyId}, ${passwordHash}, ${now}, ${now}
      )
    `;

    const { accessToken, refreshToken } = issueCompanyTokens(app, companyId);

    request.log.info({ companyId, jurisdiction: body.jurisdiction }, 'Company registered');

    return reply.status(201).send({
      company_id:    companyId,
      access_token:  accessToken,
      refresh_token: refreshToken,
      status:        body.compliance_agreement_accepted ? 'active' : 'pending_verification',
    });
  });

  /**
   * POST /v1/auth/login-company
   */
  app.post('/login-company', {
    schema: {
      tags: ['auth'],
      summary: 'Company login',
      body: {
        type: 'object',
        required: ['email','password'],
        additionalProperties: false,
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            access_token:  { type: 'string' },
            refresh_token: { type: 'string' },
            company_id:    { type: 'string' },
            status:        { type: 'string' },
          },
        },
      },
    },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = request.body as { email: string; password: string };

    const rows = await app.db`
      SELECT c.company_id, c.status, ca.password_hash, ca.locked_until, ca.failed_login_count
      FROM matching.companies c
      JOIN identity.company_auth ca USING (company_id)
      WHERE c.compliance_contact_email = ${email.toLowerCase()}
      LIMIT 1
    `;

    const dummy = '$2b$12$invalidhashforcomparison';
    const hash  = rows[0]?.password_hash ?? dummy;
    const valid = await bcrypt.compare(password, hash);

    if (!rows[0] || !valid) {
      if (rows[0]) {
        await app.identityDb`
          UPDATE identity.company_auth
          SET failed_login_count = failed_login_count + 1, updated_at = NOW()
          WHERE company_id = ${rows[0].company_id as string}
        `.catch(() => {});
      }
      throw new UnauthorisedError('Invalid email address or password');
    }

    const company = rows[0];
    if (company.locked_until && new Date(company.locked_until as string) > new Date()) {
      throw new UnauthorisedError('Account temporarily locked. Please try again later.');
    }

    await app.identityDb`
      UPDATE identity.company_auth
      SET failed_login_count = 0, last_login_at = NOW(), updated_at = NOW()
      WHERE company_id = ${company.company_id as string}
    `;

    const { accessToken, refreshToken } = issueCompanyTokens(app, company.company_id as string);

    return reply.send({
      access_token:  accessToken,
      refresh_token: refreshToken,
      company_id:    company.company_id,
      status:        company.status,
    });
  });

  /**
   * POST /v1/auth/accept-compliance-agreement
   * Company accepts the compliance agreement after registration.
   */
  app.post('/accept-compliance-agreement', {
    schema: {
      tags: ['auth'],
      summary: 'Accept FHP Company Compliance Agreement',
      body: {
        type: 'object',
        required: ['accepted'],
        properties: { accepted: { type: 'boolean', const: true } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    await request.jwtVerify();
    const payload = request.user as any;
    if (payload.role !== 'company') {
      throw new ValidationError('This endpoint is for company accounts only');
    }

    await app.db`
      UPDATE matching.companies SET
        compliance_agreement_accepted = TRUE,
        compliance_agreement_accepted_at = NOW(),
        compliance_agreement_version = '1.0',
        status = 'active',
        updated_at = NOW()
      WHERE company_id = ${payload.companyId}
        AND status = 'pending_verification'
    `;

    return reply.send({ status: 'active', compliance_agreement_accepted: true });
  });
}

function issueCompanyTokens(app: FastifyInstance, companyId: string) {
  const accessToken = app.jwt.sign({
    sub:       companyId,
    companyId,
    role:      'company',
    aud:       'fhp-companies',
  });
  const refreshToken = app.jwt.sign(
    { sub: companyId, companyId, role: 'company', aud: 'fhp-companies', type: 'refresh' },
    { expiresIn: '30d' }
  );
  return { accessToken, refreshToken };
}
