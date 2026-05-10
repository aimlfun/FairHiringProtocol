/**
 * FHP Database Connection
 *
 * Two connection pools:
 *   - db:         fhp_api_user role — all non-PII operations
 *   - identityDb: fhp_identity_user role — PII operations (email, auth) only
 *
 * The privacy boundary from specs/database-architecture.md §4.2 is enforced
 * at the connection level: the matching engine and API use `db`, which has
 * zero access to the identity schema. Identity operations use `identityDb`.
 *
 * RLS session injection:
 * Every authenticated request must call setSessionContext() before any query.
 * This sets the Postgres session variables that Row-Level Security policies
 * use to filter rows. In C# terms: it's like setting ambient context before
 * executing a unit of work.
 *
 * In C# / Dapper terms, the `sql` tagged template is equivalent to:
 *   connection.QueryAsync<T>("SELECT ... WHERE id = @id", new { id })
 * but injection-safe by construction (parameters are never concatenated).
 */

import postgres from 'postgres';
import { config } from '../config/index.ts';

// ── Connection pools ──────────────────────────────────────────────────────────

/**
 * Primary API pool — fhp_api_user role.
 * Use this for all standard operations.
 * Has NO access to identity.candidate_identity or identity.candidate_auth.
 */
export const db = postgres(config.databaseUrl, {
  max:         20,        // max connections in pool
  idle_timeout: 20,       // close idle connections after 20s
  connect_timeout: 10,    // fail fast if DB unreachable
  transform: {
    // Return undefined for null values (cleaner TypeScript)
    undefined: null,
  },
  onnotice: (notice) => {
    // Log Postgres NOTICE messages (e.g. from partition maintenance)
    console.warn('[postgres notice]', notice.message);
  },
});

/**
 * Identity pool — fhp_identity_user role.
 * Use ONLY for operations that need PII: registration, login, profile contact.
 * This is the ONLY pool that can read identity.candidate_identity.
 */
export const identityDb = postgres(config.identityDatabaseUrl, {
  max:         5,         // smaller pool — PII operations are less frequent
  idle_timeout: 20,
  connect_timeout: 10,
  transform: { undefined: null },
});

// ── RLS session context injection ─────────────────────────────────────────────

/**
 * Set the Postgres session variables that drive Row-Level Security.
 * Must be called at the start of every authenticated request handler,
 * before any database query.
 *
 * Uses SET_CONFIG with transaction-local=TRUE so the context is automatically
 * cleared when the connection returns to the pool.
 *
 * Example:
 *   await setSessionContext(db, { candidateId: req.user.candidateId });
 *   const matches = await db`SELECT * FROM matching.match_events ...`;
 */
export async function setSessionContext(
  sql: postgres.Sql,
  context: {
    candidateId?: string;
    companyId?:   string;
  }
): Promise<void> {
  // Build SET_CONFIG calls for each provided context value
  // We use a transaction to ensure all are set atomically
  await sql.begin(async (tx) => {
    if (context.candidateId) {
      await tx`SELECT SET_CONFIG('fhp.current_candidate_id', ${context.candidateId}, TRUE)`;
    }
    if (context.companyId) {
      await tx`SELECT SET_CONFIG('fhp.current_company_id', ${context.companyId}, TRUE)`;
    }
    // If neither is set, RLS will only allow governance/admin role access
  });
}

/**
 * Run a set of queries within a single transaction, with RLS context set.
 * This is the recommended pattern for multi-step operations (e.g. match + explanation).
 *
 * In C# terms: equivalent to using a TransactionScope with ambient context.
 *
 * Example:
 *   const result = await withTransaction(db, candidateId, async (tx) => {
 *     await tx`INSERT INTO matching.match_events ...`;
 *     await tx`INSERT INTO matching.match_explanations ...`;
 *     return result;
 *   });
 */
export async function withTransaction<T>(
  sql: postgres.Sql,
  context: { candidateId?: string; companyId?: string },
  fn: (tx: postgres.TransactionSql) => Promise<T>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return sql.begin(async (tx: postgres.TransactionSql) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // Set RLS context within the transaction
    if (context.candidateId) {
      await tx`SELECT SET_CONFIG('fhp.current_candidate_id', ${context.candidateId}, TRUE)`;
    }
    if (context.companyId) {
      await tx`SELECT SET_CONFIG('fhp.current_company_id', ${context.companyId}, TRUE)`;
    }
    return fn(tx);
  });
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function checkDatabaseHealth(): Promise<{
  api:      'ok' | 'error';
  identity: 'ok' | 'error';
}> {
  const [apiResult, identityResult] = await Promise.allSettled([
    db`SELECT 1 AS ok`,
    identityDb`SELECT 1 AS ok`,
  ]);
  return {
    api:      apiResult.status      === 'fulfilled' ? 'ok' : 'error',
    identity: identityResult.status === 'fulfilled' ? 'ok' : 'error',
  };
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

export async function closeDatabaseConnections(): Promise<void> {
  await Promise.all([db.end(), identityDb.end()]);
}
