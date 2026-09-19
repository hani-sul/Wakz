import Fastify, { type FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { registerRoutes } from './routes.ts';

export type AppOptions = {
  db: DatabaseSync;
  adminToken: string | null;
  webOrigin: string;
  logLevel?: string;
};

const RATE_LIMIT = 180;
const RATE_WINDOW_MS = 60_000;

/**
 * Builds the HTTP API. Kept separate from the entrypoint so tests can use `app.inject()`
 * without opening a socket.
 */
export function createApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: false, trustProxy: false, bodyLimit: 256 * 1024 });
  const startedAt = new Date().toISOString();
  const buckets = new Map<string, { tokens: number; updatedAt: number }>();

  app.addHook('onRequest', async (request, reply) => {
    const ip = request.ip || 'unknown';
    const now = Date.now();
    const bucket = buckets.get(ip) ?? { tokens: RATE_LIMIT, updatedAt: now };
    const elapsed = now - bucket.updatedAt;
    if (elapsed > 0) {
      bucket.tokens = Math.min(RATE_LIMIT, bucket.tokens + (elapsed / RATE_WINDOW_MS) * RATE_LIMIT);
      bucket.updatedAt = now;
    }
    if (bucket.tokens < 1) {
      await reply.code(429).send({ error: 'rate_limited' });
      return;
    }
    bucket.tokens -= 1;
    buckets.set(ip, bucket);
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    reply.header('permissions-policy', 'geolocation=(), microphone=(), camera=()');
    reply.header(
      'content-security-policy',
      // connect-src must allow the vendor status sources: in local-first mode the browser talks to
      // them directly (the Android build runs from file://, where no CSP applies).
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; " +
        "connect-src 'self' https: http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'",
    );
    reply.header('access-control-allow-origin', options.webOrigin);
    return payload;
  });

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _request, reply) => {
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    reply.code(statusCode).send({
      error: statusCode >= 500 ? 'internal_error' : error.code ?? 'request_error',
      message: statusCode >= 500 ? 'The server could not complete this request.' : error.message,
    });
  });

  registerRoutes(app, { db: options.db, adminToken: options.adminToken, startedAt });
  return app;
}
