/**
 * FHP API Configuration
 *
 * All configuration comes from environment variables.
 * This module validates everything at startup — the server will not start
 * if required variables are missing or malformed.
 *
 * In C# terms: think of this as IOptions<T> with validation on startup.
 * The difference is we validate eagerly rather than lazily.
 */

import 'dotenv/config';

// ── Helper: require an env var or throw at startup ────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.startsWith('CHANGE_ME')) {
    throw new Error(
      `Missing or unconfigured required environment variable: ${key}\n` +
      `Check .env.example for the expected format.`
    );
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function boolEnv(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (!val) return fallback;
  return val.toLowerCase() === 'true' || val === '1';
}

function intEnv(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) throw new Error(`Environment variable ${key} must be an integer, got: ${val}`);
  return parsed;
}

// ── Config object — all fields typed and immutable ────────────────────────────

export const config = {

  // Server
  port:    intEnv('PORT', 3000),
  host:    optionalEnv('HOST', '0.0.0.0'),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),

  get isDevelopment() { return this.nodeEnv === 'development'; },
  get isProduction()  { return this.nodeEnv === 'production'; },
  get isTest()        { return this.nodeEnv === 'test'; },

  // Database
  // Two connection strings: one for the API role, one for the identity service role.
  // They connect to the same database but with different Postgres roles,
  // enforcing the PII separation at the connection level.
  databaseUrl:         requireEnv('DATABASE_URL'),
  identityDatabaseUrl: optionalEnv(
    'IDENTITY_DATABASE_URL',
    process.env['DATABASE_URL'] ?? ''  // fallback to same DB in dev
  ),

  // Authentication
  jwt: {
    secret:         requireEnv('JWT_SECRET'),
    accessExpiry:   optionalEnv('JWT_ACCESS_EXPIRY',  '15m'),
    refreshExpiry:  optionalEnv('JWT_REFRESH_EXPIRY', '30d'),
  },

  // CORS
  corsOrigins: optionalEnv('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),

  // Rate limiting — default 500 is intentionally high for dev/test environments.
  // Production deployments should set RATE_LIMIT_MAX to a lower value (e.g. 100).
  rateLimitMax: intEnv('RATE_LIMIT_MAX', 500),

  // Logging
  logLevel: optionalEnv('LOG_LEVEL', 'info') as
    'trace' | 'debug' | 'info' | 'warn' | 'error',

  // Features
  enableSwagger: boolEnv('ENABLE_SWAGGER', true),

  // Pipeline
  // Empty string = run pipeline in-process (reference impl default)
  pipelineServiceUrl: optionalEnv('PIPELINE_SERVICE_URL', ''),
  get inProcessPipeline() { return !this.pipelineServiceUrl; },

  // Governance
  governanceApiKey: optionalEnv('GOVERNANCE_API_KEY', ''),

} as const;

// Validate at module load time — server will refuse to start if invalid
if (config.jwt.secret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters. Generate with: openssl rand -base64 64');
}

export type Config = typeof config;
