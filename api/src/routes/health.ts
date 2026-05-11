import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireCompany, requireCandidate, requireGovernance } from '../middleware/auth.ts';
import {
  NotFoundError, ValidationError, ConflictError,
  JobBriefNotActiveError, CompanyNotActiveError, AppealWindowExpiredError,
  DuplicateAppealError
} from '../errors/index.ts';

export async function healthRoutes(app: FastifyInstance): Promise<void> {

  /** GET /v1/health */
  app.get('/health', {
    schema: {
      tags: ['health'], summary: 'Liveness and readiness check',
      response: {
        200: {
          type: 'object',
          properties: {
            status:      { type: 'string' },
            version:     { type: 'string' },
            environment: { type: 'string' },
            database: {
              type: 'object',
              properties: {
                api:      { type: 'string' },
                identity: { type: 'string' },
                fairness: { type: 'string' },
              },
            },
            timestamp:   { type: 'string' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    const { checkDatabaseHealth } = await import('../db/index.ts');
    const dbHealth = await checkDatabaseHealth();
    const allOk    = Object.values(dbHealth).every(v => v === 'ok');

    return reply.status(allOk ? 200 : 503).send({
      status:      allOk ? 'ok' : 'degraded',
      version:     '1.0.0',
      environment: process.env['NODE_ENV'] ?? 'unknown',
      database:    dbHealth,
      timestamp:   new Date().toISOString(),
    });
  });

  /** GET /v1/health/conformance — reports which FHP version this API implements */
  app.get('/health/conformance', {
    schema: { tags: ['health'], summary: 'FHP conformance declaration' },
  }, async (_request, reply) => {
    return reply.send({
      fhp_version:           '1.0.0',
      pipeline_version:      '1.0.0',
      api_version:           '1.0.0',
      conformance_test_url:  '/documentation',
      endpoints_implemented: 30,
      timestamp:             new Date().toISOString(),
    });
  });
}
