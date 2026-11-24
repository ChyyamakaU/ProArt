import { checkDatabaseHealth, registerGracefulShutdown } from './config/db.js';
import { env } from './config/env.js';
import { createApp } from './app.js';

/**
 * Boots the SkillVerify REST API server and attaches graceful shutdown hooks.
 */
async function startServer() {
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.info(
      `[SERVER] SkillVerify API listening on port ${env.PORT} (${env.NODE_ENV})`,
    );
  });

  // Harden HTTP keep-alive and header timeouts against Slowloris attacks.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 30_000;

  // Non-fatal startup DB diagnostic log (readiness is verified via GET /api/health).
  try {
    const dbStatus = await checkDatabaseHealth();
    console.info(`[DB] PostgreSQL connected (${dbStatus.latencyMs}ms)`);
  } catch (err) {
    console.warn(
      `[DB] Initial PostgreSQL connectivity check failed: ${err.message}. Check DATABASE_URL and ensure migrations have run.`,
    );
  }

  registerGracefulShutdown(
    () =>
      new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            return reject(err);
          }
          console.info('[SHUTDOWN] HTTP server stopped accepting new connections.');
          return resolve();
        });
      }),
  );
}

startServer().catch((err) => {
  console.error('[FATAL] Failed to start server:', err);
  process.exit(1);
});
