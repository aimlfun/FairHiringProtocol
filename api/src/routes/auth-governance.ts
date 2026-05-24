/**
 * FHP API — Governance Authentication
 *
 * POST /v1/auth/login-governance
 *   Verifies username + bcrypt password against identity.governance_users.
 *   Issues a JWT with role: 'governance' | 'admin'.
 *
 * Governance users are created via: npm run seed:governance
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { config } from '../config/index.ts';
import { UnauthorisedError } from '../errors/index.ts';

export async function authGovernanceRoutes(app: FastifyInstance): Promise<void> {

  app.post('/login-governance', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      tags: ['auth'],
      summary: 'Sign in as a governance officer or admin',
      body: {
        type: 'object',
        required: ['username', 'password'],
        additionalProperties: false,
        properties: {
          username: { type: 'string', minLength: 1, maxLength: 64 },
          password: { type: 'string', minLength: 1, maxLength: 128 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            access_token:  { type: 'string' },
            role:          { type: 'string' },
            display_name:  { type: 'string' },
            username:      { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { username, password } = request.body as { username: string; password: string };

    const rows = await app.identityDb`
      SELECT user_id, username, password_hash, role, display_name, is_active
      FROM identity.governance_users
      WHERE username = ${username.toLowerCase()}
      LIMIT 1
    `;

    // Constant-time comparison to avoid username enumeration
    const dummy = '$2b$12$invalidhashforcomparison000000000000000000000000000000';
    const hash  = rows[0]?.password_hash ?? dummy;
    const valid = await bcrypt.compare(password, hash);

    if (!rows[0] || !valid || !rows[0].is_active) {
      throw new UnauthorisedError('Invalid username or password');
    }

    const user = rows[0];

    await app.identityDb`
      UPDATE identity.governance_users
      SET last_login_at = NOW()
      WHERE user_id = ${user.user_id as string}
    `;

    const accessToken = app.jwt.sign({
      sub:  user.user_id as string,
      role: user.role as string,
      aud:  'fhp-governance',
    }, { expiresIn: config.jwt.accessExpiry });

    return reply.send({
      access_token: accessToken,
      role:         user.role,
      display_name: user.display_name ?? user.username,
      username:     user.username,
    });
  });
}
