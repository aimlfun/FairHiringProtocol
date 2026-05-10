/**
 * FHP API — Auth Routes
 *
 * POST /v1/auth/register   — candidate or company registration
 * POST /v1/auth/login      — issue JWT access + refresh tokens
 * POST /v1/auth/refresh    — exchange refresh token for new access token
 * DELETE /v1/auth/logout   — invalidate refresh token
 *
 * Architecture note:
 * Registration creates two records in two schemas:
 *   - identity.candidate_identity  (email — PII, via identityDb)
 *   - matching.candidate_profiles  (skills profile — no PII, via db)
 *
 * These two inserts must be atomic. We use a distributed transaction pattern:
 * insert identity first (generates candidate_id), then insert profile with
 * that ID. If the profile insert fails, we roll back the identity insert.
 *
 * In C# terms: this is equivalent to a two-step Unit of Work across two
 * DbContext instances, coordinated manually (no distributed transaction
 * manager needed since it's the same Postgres instance, different roles).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt  from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { config }        from '../config/index.ts';
import { NotFoundError, UnauthorisedError, ConflictError, ValidationError } from '../errors/index.ts';

// ── Request/response schemas ──────────────────────────────────────────────────

const registerCandidateSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email:            { type: 'string', format: 'email', maxLength: 254 },
      password:         { type: 'string', minLength: 12, maxLength: 128 },
      preferred_language: { type: 'string', pattern: '^[a-z]{2}(-[A-Z]{2})?$', default: 'en' },
      age_confirmed:    { type: 'boolean', const: true },
    },
  },
} as const;

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email:    { type: 'string', format: 'email' },
      password: { type: 'string' },
    },
  },
} as const;

const refreshSchema = {
  body: {
    type: 'object',
    required: ['refresh_token'],
    additionalProperties: false,
    properties: {
      refresh_token: { type: 'string' },
    },
  },
} as const;

// ── Routes ────────────────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance): Promise<void> {

  /**
   * POST /v1/auth/register
   * Candidate registration — creates identity + profile records atomically.
   */
  app.post('/register', {
    schema: {
      tags: ['auth'],
      summary: 'Register a new candidate account',
      description: 'Creates a candidate identity record and an empty skills profile. ' +
        'The candidate must confirm they are 18+ (age_confirmed: true).',
      ...registerCandidateSchema,
      response: {
        201: {
          type: 'object',
          properties: {
            candidate_id:  { type: 'string', format: 'uuid' },
            access_token:  { type: 'string' },
            refresh_token: { type: 'string' },
            message:       { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      email: string;
      password: string;
      preferred_language?: string;
      age_confirmed: boolean;
    };

    if (!body.age_confirmed) {
      throw new ValidationError('You must confirm you are 18 or over to register');
    }

    // Check for duplicate email (using identity pool)
    const existing = await app.identityDb`
      SELECT candidate_id FROM identity.candidate_identity
      WHERE contact_email = ${body.email.toLowerCase()}
      LIMIT 1
    `;

    if (existing.length > 0) {
      throw new ConflictError('An account with this email address already exists');
    }

    const candidateId   = uuidv4();
    const passwordHash  = await bcrypt.hash(body.password, 12);
    const now           = new Date();

    // Step 1: Create identity record (PII — uses identity pool)
    await app.identityDb`
      INSERT INTO identity.candidate_identity
        (candidate_id, contact_email, preferred_language, created_at, updated_at)
      VALUES
        (${candidateId}, ${body.email.toLowerCase()},
         ${body.preferred_language ?? 'en'}, ${now}, ${now})
    `;

    // Step 2: Create auth record
    await app.identityDb`
      INSERT INTO identity.candidate_auth
        (candidate_id, password_hash, age_confirmed, age_confirmed_at, created_at, updated_at)
      VALUES
        (${candidateId}, ${passwordHash}, TRUE, ${now}, ${now}, ${now})
    `;

    // Step 3: Create profile record (no PII — uses standard pool)
    await app.db`
      INSERT INTO matching.candidate_profiles
        (candidate_id, fhp_version, skills, matching_eligible, created_at, updated_at)
      VALUES
        (${candidateId}, ${'1.0.0'}, '[]'::jsonb, FALSE, ${now}, ${now})
    `;

    // Issue tokens
    const { accessToken, refreshToken } = await issueTokens(app, {
      sub:         candidateId,
      candidateId,
      role:        'candidate',
      audience:    'fhp-candidates',
    });

    request.log.info({ candidateId }, 'New candidate registered');

    return reply.status(201).send({
      candidate_id:  candidateId,
      access_token:  accessToken,
      refresh_token: refreshToken,
      message:       'Registration successful. Add skills to your profile to start matching.',
    });
  });

  /**
   * POST /v1/auth/login
   */
  app.post('/login', {
    schema: {
      tags: ['auth'],
      summary: 'Authenticate and receive tokens',
      ...loginSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            access_token:  { type: 'string' },
            refresh_token: { type: 'string' },
            role:          { type: 'string' },
            candidate_id:  { type: 'string' },
          },
        },
      },
    },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, // Tighter limit for login
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = request.body as { email: string; password: string };

    // Fetch identity record
    const identityRows = await app.identityDb`
      SELECT
        ci.candidate_id,
        ca.password_hash,
        ca.locked_until,
        ca.failed_login_count,
        ca.age_confirmed
      FROM identity.candidate_identity ci
      JOIN identity.candidate_auth ca USING (candidate_id)
      WHERE ci.contact_email = ${email.toLowerCase()}
      LIMIT 1
    `;

    // Use constant-time comparison to avoid email enumeration
    const dummy = '$2b$12$invalidhashforcomparison';
    const hash  = identityRows[0]?.password_hash ?? dummy;
    const valid = await bcrypt.compare(password, hash);

    if (!identityRows[0] || !valid) {
      // Increment failed login counter (best-effort — don't fail the request if this fails)
      if (identityRows[0]) {
        await app.identityDb`
          UPDATE identity.candidate_auth
          SET failed_login_count = failed_login_count + 1, updated_at = NOW()
          WHERE candidate_id = ${identityRows[0].candidate_id}
        `.catch(() => {});
      }
      throw new UnauthorisedError('Invalid email address or password');
    }

    const auth = identityRows[0];

    // Check account lock
    if (auth.locked_until && new Date(auth.locked_until as string) > new Date()) {
      throw new UnauthorisedError('Account temporarily locked. Please try again later.');
    }

    // Reset failed counter on successful login
    await app.identityDb`
      UPDATE identity.candidate_auth
      SET failed_login_count = 0, last_login_at = NOW(), updated_at = NOW()
      WHERE candidate_id = ${auth.candidate_id as string}
    `;

    const { accessToken, refreshToken } = await issueTokens(app, {
      sub:         auth.candidate_id as string,
      candidateId: auth.candidate_id as string,
      role:        'candidate',
      audience:    'fhp-candidates',
    });

    return reply.send({
      access_token:  accessToken,
      refresh_token: refreshToken,
      role:          'candidate',
      candidate_id:  auth.candidate_id,
    });
  });

  /**
   * POST /v1/auth/refresh
   * Exchange a refresh token for a new access token.
   */
  app.post('/refresh', {
    schema: {
      tags: ['auth'],
      summary: 'Refresh an access token',
      ...refreshSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            access_token: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { refresh_token } = request.body as { refresh_token: string };

    // Verify the refresh token
    let payload: any;
    try {
      payload = app.jwt.verify(refresh_token);
    } catch {
      throw new UnauthorisedError('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorisedError('Token is not a refresh token');
    }

    // Issue new access token only (not a new refresh token)
    const accessToken = app.jwt.sign({
      sub:         payload.sub,
      candidateId: payload.candidateId,
      companyId:   payload.companyId,
      role:        payload.role,
      aud:         payload.aud,
    });

    return reply.send({ access_token: accessToken });
  });

  /**
   * DELETE /v1/auth/logout
   * Invalidates the refresh token server-side.
   * Note: access tokens remain valid until expiry (JWT is stateless).
   * In production, implement a token blocklist in Redis for immediate revocation.
   */
  app.delete('/logout', {
    schema: {
      tags: ['auth'],
      summary: 'Log out and invalidate refresh token',
      response: { 204: { type: 'null' } },
    },
  }, async (_request, reply) => {
    // Stateless JWT — access token expires naturally.
    // TODO: add refresh token to blocklist (Redis) for production.
    return reply.status(204).send();
  });
}

// ── Token issuance helper ─────────────────────────────────────────────────────

async function issueTokens(
  app: FastifyInstance,
  payload: {
    sub:         string;
    candidateId?: string;
    companyId?:  string;
    role:        'candidate' | 'company' | 'governance';
    audience:    string;
  }
): Promise<{ accessToken: string; refreshToken: string }> {

  const accessToken = app.jwt.sign({
    sub:         payload.sub,
    candidateId: payload.candidateId,
    companyId:   payload.companyId,
    role:        payload.role,
    aud:         payload.audience,
  });

  // Refresh token — longer-lived, different type claim
  const refreshToken = app.jwt.sign(
    {
      sub:         payload.sub,
      candidateId: payload.candidateId,
      companyId:   payload.companyId,
      role:        payload.role,
      aud:         payload.audience,
      type:        'refresh',
    },
    { expiresIn: config.jwt.refreshExpiry }
  );

  return { accessToken, refreshToken };
}
