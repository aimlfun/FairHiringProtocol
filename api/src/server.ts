/**
 * FHP API — Server Entry Point
 *
 * Starts the Fastify application and handles graceful shutdown.
 * Keeps app.ts clean (buildable/testable without starting a server).
 */

import { buildApp }                    from './app.ts';
import { config }                      from './config/index.ts';
import { closeDatabaseConnections }    from './db/index.ts';

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    const address = await app.listen({
      port: config.port,
      host: config.host,
    });
    app.log.info(`FHP API listening at ${address}`);
    app.log.info(`Environment: ${config.nodeEnv}`);
    if (config.enableSwagger) {
      app.log.info(`API docs: ${address}/documentation`);
    }
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    process.exit(1);
  }
}

// ── Graceful shutdown ──────────────────────────────────────────────────────────
// In C# terms: equivalent to IHostApplicationLifetime.ApplicationStopping

async function shutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal} — shutting down gracefully`);
  try {
    await closeDatabaseConnections();
    console.log('Database connections closed');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException',  (err) => { console.error('Uncaught exception:', err); process.exit(1); });
process.on('unhandledRejection', (err) => { console.error('Unhandled rejection:', err); process.exit(1); });

start();
