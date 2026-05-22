/**
 * FHP API — Fastify Server
 *
 * This file builds and configures the Fastify application.
 * It's separate from server.ts (which starts it) so tests can
 * import buildApp() without starting a server.
 *
 * Plugin registration order matters in Fastify:
 *   1. Security plugins (helmet, rate limit, cors)
 *   2. Auth plugin (jwt)
 *   3. Database plugin
 *   4. Error handler
 *   5. Routes
 *   6. Swagger (last — needs all routes registered to document them)
 */

import Fastify, { type FastifyInstance } from 'fastify';
import helmet         from '@fastify/helmet';
import cors           from '@fastify/cors';
import rateLimit      from '@fastify/rate-limit';
import fastifyJwt from '@fastify/jwt';
import swagger        from '@fastify/swagger';
import swaggerUi      from '@fastify/swagger-ui';

import { config }     from './config/index.ts';
import { db, identityDb, fairnessDb, closeDatabaseConnections } from './db/index.ts';
import { FHPApiError } from './errors/index.ts';

// Route handlers — original
import { authRoutes }       from './routes/auth.ts';
import { candidateRoutes }  from './routes/candidates.ts';
import { jobRoutes }        from './routes/jobs.ts';
import { matchRoutes }      from './routes/matches.ts';
import { appealRoutes }     from './routes/appeals.ts';
import { companyRoutes }    from './routes/companies.ts';
import { governanceRoutes } from './routes/governance.ts';
import { healthRoutes }     from './routes/health.ts';

// Route handlers — extended (new endpoints from gap analysis)
import { companyAuthRoutes }        from './routes/auth-company.ts';
import { notificationRoutes }       from './routes/notifications.ts';
import {
  appealsExtendedRoutes,
  ontologyRoutes,
  companyPublicRoutes,
}                                   from './routes/appeals-extended.ts';
import {
  companiesExtendedRoutes,
  referenceRoutes,
}                                   from './routes/companies-extended.ts';
import { governanceExtendedRoutes } from './routes/governance-extended.ts';
import { demographicsRoutes }        from './routes/demographics.ts';

export async function buildApp(): Promise<FastifyInstance> {

  const app = Fastify({
    logger: {
      level: config.logLevel,
      ...(config.isDevelopment ? { transport: { target: 'pino-pretty' } } : {}),
    },
    // Fastify generates unique request IDs — useful for correlating logs
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: 'x-request-id',
  });

  // ── Security headers ────────────────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false, // API-only — no HTML served
  });

  // ── CORS ────────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    credentials: true,
  });

  // ── Rate limiting ────────────────────────────────────────────────────────────
  // Applied globally — individual routes can override with stricter limits
  await app.register(rateLimit, {
    max:        config.rateLimitMax,
    timeWindow: '1 minute',
    // Must return an Error with statusCode — the plugin throws the return value,
    // so a plain object would fall through to the 500 handler.
    errorResponseBuilder: (_req, _ctx) => {
      const err: Error & { statusCode?: number; error?: string } = new Error(
        'Too many requests. Please slow down.'
      );
      err.statusCode = 429;
      err.error      = 'RATE_LIMITED';
      return err;
    },
  });

  // ── JWT authentication ───────────────────────────────────────────────────────
  // @fastify/jwt decorates the request with request.jwtVerify() and reply.jwtSign()
  // In C# terms: this is equivalent to AddJwtBearer() in the auth middleware pipeline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(fastifyJwt as any, {
    secret: config.jwt.secret,
    sign: {
      expiresIn: config.jwt.accessExpiry,
      issuer:    'fhp-api',
      audience:  'fhp-candidates',
    },
    verify: {
      issuer:   'fhp-api',
      audience: ['fhp-candidates', 'fhp-companies', 'fhp-governance'],
    },
  });

  // ── Make db pools available on every request ────────────────────────────────
  // In C# terms: this is like registering IDbConnection in DI,
  // except Fastify uses request decoration rather than constructor injection
  app.decorate('db', db);
  app.decorate('identityDb', identityDb);
  app.decorate('fairnessDb', fairnessDb);  // fhp_fairness_service role — demographics only

  // ── OpenAPI / Swagger ────────────────────────────────────────────────────────
  if (config.enableSwagger) {
    await app.register(swagger, {
      openapi: {
        info: {
          title:       'Fair Hiring Protocol API',
          description: 'The canonical FHP REST API. All endpoints are documented here.',
          version:     '1.0.0',
          contact: {
            name: 'FHP Technical Working Group',
            url:  'https://fair-hiring-protocol.org',
          },
          license: {
            name: 'Apache 2.0',
            url:  'https://www.apache.org/licenses/LICENSE-2.0',
          },
        },
        components: {
          securitySchemes: {
            bearerAuth: {
              type:         'http',
              scheme:       'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
        security: [{ bearerAuth: [] }],
        tags: [
          { name: 'auth',       description: 'Authentication and registration' },
          { name: 'candidates', description: 'Candidate profile management' },
          { name: 'jobs',       description: 'Job brief management' },
          { name: 'matches',    description: 'Pipeline execution and explanations' },
          { name: 'appeals',    description: 'Appeal submission and tracking' },
          { name: 'companies',  description: 'Company account and compliance dashboard' },
          { name: 'governance', description: 'Governance bodies — escalations and audit' },
          { name: 'health',     description: 'Health and conformance checks' },
          { name: 'ontology',   description: 'FHP skill ontology search' },
          { name: 'reference',  description: 'Reference data — rejection codes etc.' },
        ],
      },
    });

    await app.register(swaggerUi, {
      routePrefix: '/documentation',
      uiConfig: { docExpansion: 'list' },
    });
  }

  // ── Global error handler ─────────────────────────────────────────────────────
  // In C# terms: this is the equivalent of UseExceptionHandler middleware.
  // Maps FHPApiError instances to structured JSON responses.
  // Handles Postgres errors, JWT errors, and validation errors from Fastify.
  app.setErrorHandler((error, request, reply) => {
    const log = request.log;

    // FHP application errors — known, expected
    if (error instanceof FHPApiError) {
      log.info({ code: error.code, statusCode: error.statusCode }, error.message);
      return reply.status(error.statusCode).send(error.toJSON());
    }

    // Fastify validation errors (schema validation failed)
    if (error.validation) {
      return reply.status(400).send({
        error:   'VALIDATION_ERROR',
        message: 'Request validation failed',
        detail:  error.message,
        fields:  error.validation,
      });
    }

    // JWT errors
    if (error.statusCode === 401 || error.message.includes('jwt')) {
      return reply.status(401).send({
        error:   'UNAUTHORISED',
        message: 'Invalid or expired authentication token',
      });
    }

    // Rate limit errors (from @fastify/rate-limit)
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error:   'RATE_LIMITED',
        message: 'Too many requests. Please slow down.',
      });
    }

    // Postgres unique constraint violations → 409 Conflict
    if ((error as any).code === '23505') {
      return reply.status(409).send({
        error:   'CONFLICT',
        message: 'A record with these values already exists',
      });
    }

    // Postgres foreign key violations → 422
    if ((error as any).code === '23503') {
      return reply.status(422).send({
        error:   'UNPROCESSABLE',
        message: 'Referenced record does not exist',
      });
    }

    // Postgres immutability trigger violations → 403
    if ((error as any).code === 'P0001' && error.message.includes('Protocol violation')) {
      log.error({ err: error }, 'Protocol violation attempted');
      return reply.status(403).send({
        error:   'PROTOCOL_VIOLATION',
        message: 'This operation is not permitted by the FHP protocol',
      });
    }

    // Fastify built-in HTTP errors (content-type issues, route not found, etc.)
    // These have a numeric statusCode < 500 but don't match the patterns above.
    if (typeof error.statusCode === 'number' && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error:   (error as any).code ?? 'CLIENT_ERROR',
        message: error.message,
      });
    }

    // Unknown errors — log fully, return minimal detail to client
    log.error({ err: error }, 'Unhandled error');
    const isDev = process.env.NODE_ENV === 'development';
    return reply.status(500).send({
      error:     'INTERNAL_ERROR',
      message:   isDev ? (error instanceof Error ? error.message : String(error)) : 'An unexpected error occurred',
      dev_stack: isDev && error instanceof Error ? error.stack : undefined,
      requestId: request.id,
    });
  });

  // ── 404 handler ──────────────────────────────────────────────────────────────
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error:   'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });

  // ── Register route groups ────────────────────────────────────────────────────
  // All routes are prefixed with /v1 for versioning.
  // In C# terms: these are equivalent to controller registrations in MapControllers().
  await app.register(healthRoutes,     { prefix: '/v1' });
  await app.register(authRoutes,       { prefix: '/v1/auth' });
  await app.register(candidateRoutes,  { prefix: '/v1/candidates' });
  await app.register(jobRoutes,        { prefix: '/v1/jobs' });
  await app.register(matchRoutes,      { prefix: '/v1/matches' });
  await app.register(appealRoutes,     { prefix: '/v1' });
  await app.register(companyRoutes,    { prefix: '/v1/companies' });
  await app.register(governanceRoutes,         { prefix: '/v1/governance' });

  // Extended routes — new endpoints from gap analysis
  await app.register(companyAuthRoutes,        { prefix: '/v1/auth' });
  await app.register(notificationRoutes,       { prefix: '/v1/candidates' });
  await app.register(appealsExtendedRoutes,    { prefix: '/v1/candidates' });
  await app.register(ontologyRoutes,           { prefix: '/v1/ontology' });
  await app.register(companyPublicRoutes,      { prefix: '/v1/companies' });
  await app.register(companiesExtendedRoutes,  { prefix: '/v1/companies' });
  await app.register(referenceRoutes,          { prefix: '/v1/reference' });
  await app.register(governanceExtendedRoutes, { prefix: '/v1/governance' });
  await app.register(demographicsRoutes,       { prefix: '/v1/candidates' });

  return app;
}
