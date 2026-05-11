/**
 * FHP Fastify Type Extensions
 * Adds db and identityDb to FastifyInstance type
 */
import 'fastify';
import type postgres from 'postgres';

declare module 'fastify' {
  interface FastifyInstance {
    db:         postgres.Sql;
    identityDb: postgres.Sql;
    fairnessDb: postgres.Sql;
  }
  interface FastifyRequest {
    user: import('./middleware/auth.js').JwtPayload;
  }
}
