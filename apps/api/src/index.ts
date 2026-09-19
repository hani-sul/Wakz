import { existsSync } from 'node:fs';
import path from 'node:path';
import { createLogger, loadConfig } from '../../../packages/core/src/index.ts';
import { openDatabase, seedCatalog } from '../../../packages/db/src/index.ts';
import { CATEGORIES, SERVICES } from '../../../packages/core/src/index.ts';
import { createApp } from './app.ts';
import { indexFile, resolveStaticFile } from './static.ts';

const config = loadConfig();
const log = createLogger(config.logLevel, 'api');
const db = openDatabase(config.dbPath);
seedCatalog(db, CATEGORIES, SERVICES, config.defaultPollSeconds);

const WEB_DIST = path.resolve(import.meta.dirname, '..', '..', 'web', 'dist');
const app = createApp({ db, adminToken: config.adminToken, webOrigin: config.webOrigin });

app.get('/', async (_request, reply) => {
  const index = indexFile(WEB_DIST);
  if (!index) {
    return reply.type('text/plain').send(
      'TechPulse API is running. Build the web app with "npm run web:build" to serve the dashboard from this port.',
    );
  }
  reply.header('content-length', index.size);
  return reply.type(index.type).send(index.stream);
});

app.get('/*', async (request, reply) => {
  const urlPath = request.url.split('?')[0] ?? '/';
  if (urlPath.startsWith('/api/')) {
    return reply.code(404).send({ error: 'not_found' });
  }
  const file = resolveStaticFile(WEB_DIST, urlPath);
  if (file) {
    reply.header('content-length', file.size);
    if (urlPath.startsWith('/assets/')) {
      reply.header('cache-control', 'public, max-age=31536000, immutable');
    }
    return reply.type(file.type).send(file.stream);
  }
  const index = indexFile(WEB_DIST);
  if (index) {
    reply.header('content-length', index.size);
    return reply.type(index.type).send(index.stream);
  }
  return reply.code(404).send({ error: 'not_found' });
});

await app.listen({ host: config.apiHost, port: config.apiPort });
log.info('api listening', {
  url: `http://${config.apiHost}:${config.apiPort}`,
  db: config.dbPath,
  adminApi: config.adminToken ? 'enabled' : 'disabled',
  webBuild: existsSync(WEB_DIST) ? WEB_DIST : 'not built',
});

const shutdown = async (signal: string): Promise<void> => {
  log.info('shutting down', { signal });
  await app.close();
  db.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
