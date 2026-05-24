/**
 * FHP API — Authentication Middleware
 *
 * Fastify uses "hooks" for middleware — similar to ASP.NET Core middleware
 * but attached to specific routes or route groups rather than the pipeline.
 *
 * Three authentication levels:
 *   requireCandidate — valid JWT with role='candidate'
 *   requireCompany   — valid JWT with role='company'
 *   requireGovernance — valid JWT with role='governance', or GOVERNANCE_API_KEY header
 *
 * After authentication, the handler can access:
 *   request.user.candidateId  (for candidate JWTs)
 *   request.user.companyId    (for company JWTs)
 *   request.user.role
 */

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { UnauthorisedError, ForbiddenError } from '../errors/index.ts';
import { config } from '../config/index.ts';

// ── JWT payload type ──────────────────────────────────────────────────────────
// Extend FastifyRequest to carry the decoded JWT payload
export interface JwtPayload {
  sub:          string;         // candidate_id or company_id
  role:         'candidate' | 'company' | 'governance' | 'admin';
  candidateId?: string;
  companyId?:   string;
  iat:          number;
  exp:          number;
  iss:          string;
  aud:          string | string[];
}

// ── Middleware functions ──────────────────────────────────────────────────────

/**
 * Require a valid candidate JWT.
 * Attach user to request. Set RLS context before handler runs.
 *
 * Usage in route:
 *   { preHandler: [requireCandidate] }
 */
export async function requireCandidate(
  request: FastifyRequest,
  reply:   FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw new UnauthorisedError('Valid candidate authentication required');
  }

  const payload = request.user as unknown as JwtPayload;

  if (payload.role !== 'candidate') {
    throw new ForbiddenError('This endpoint requires a candidate account');
  }

  if (!payload.candidateId) {
    throw new UnauthorisedError('Malformed token: missing candidateId');
  }

  // Inject RLS session context for this request
  // Every subsequent DB query in this handler will be filtered by RLS
  // to only show this candidate's data
  await request.server.db.begin(async (tx) => {
    await tx`SELECT SET_CONFIG('fhp.current_candidate_id', ${payload.candidateId!}, TRUE)`;
  });
}

/**
 * Require a valid company JWT.
 */
export async function requireCompany(
  request: FastifyRequest,
  reply:   FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw new UnauthorisedError('Valid company authentication required');
  }

  const payload = request.user as unknown as JwtPayload;

  if (payload.role !== 'company') {
    throw new ForbiddenError('This endpoint requires a company account');
  }

  if (!payload.companyId) {
    throw new UnauthorisedError('Malformed token: missing companyId');
  }

  await request.server.db.begin(async (tx) => {
    await tx`SELECT SET_CONFIG('fhp.current_company_id', ${payload.companyId!}, TRUE)`;
  });
}

/**
 * Require governance-level access.
 * Accepts either a governance JWT or the GOVERNANCE_API_KEY header.
 * The API key is for internal automated systems (nightly jobs, etc.).
 */
export async function requireGovernance(
  request: FastifyRequest,
  reply:   FastifyReply,
): Promise<void> {
  // Check API key first (for automated systems)
  const apiKey = request.headers['x-governance-api-key'];
  if (apiKey && config.governanceApiKey && apiKey === config.governanceApiKey) {
    return; // Authorised via API key
  }

  // Otherwise verify JWT
  try {
    await request.jwtVerify();
  } catch {
    throw new UnauthorisedError('Governance authentication required');
  }

  const payload = request.user as unknown as JwtPayload;
  if (payload.role !== 'governance' && payload.role !== 'admin') {
    throw new ForbiddenError('This endpoint requires governance-level access');
  }
}

/**
 * Optional authentication — sets user if JWT present, continues if not.
 * Used for public endpoints that behave differently when authenticated.
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply:  FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    // No valid JWT — that's fine for optional auth
  }
}
