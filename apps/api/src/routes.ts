import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import {
  CATEGORIES,
  SERVICES,
  collectConfigFromEnv,
  isAllowedPublicUrl,
  loadConfig,
  mapStatusText,
} from '../../../packages/core/src/index.ts';
import {
  countRows,
  deleteService,
  getActiveIncidents,
  getConnectorRuns,
  getRecentEvents,
  getServiceRow,
  insertService,
  listCategories,
  listServiceRows,
  searchCatalog,
  seedCatalog,
  setServiceEnabled,
} from '../../../packages/db/src/index.ts';
import { collectService } from '../../collector/src/runner.ts';
import { buildAllSnapshots, buildCategorySnapshots, buildServiceSnapshot, overallSummary } from './snapshots.ts';

export type RouteDeps = {
  db: DatabaseSync;
  adminToken: string | null;
  startedAt: string;
};

const HISTORY_HOURS = new Set([1, 6, 24, 168, 720]);

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db } = deps;

  app.get('/api/health', async () => {
    const counts = countRows(db);
    return {
      ok: true,
      startedAt: deps.startedAt,
      uptimeSeconds: Math.round((Date.now() - Date.parse(deps.startedAt)) / 1000),
      database: counts,
      catalog: { services: SERVICES.length, categories: CATEGORIES.length },
    };
  });

  app.get('/api/overview', async () => {
    const summary = overallSummary(db);
    const categories = buildCategorySnapshots(db).map((snapshot) => ({
      slug: snapshot.category.slug,
      name: snapshot.category.name,
      description: snapshot.category.description,
      status: snapshot.status,
      counts: snapshot.counts,
      services: snapshot.services.length,
    }));
    return { ...summary, categories };
  });

  app.get('/api/categories', async () => {
    return buildCategorySnapshots(db).map((snapshot) => ({
      slug: snapshot.category.slug,
      name: snapshot.category.name,
      description: snapshot.category.description,
      status: snapshot.status,
      counts: snapshot.counts,
      services: snapshot.services.map(toCard),
    }));
  });

  app.get('/api/services', async (request) => {
    const query = request.query as { category?: string; status?: string; q?: string };
    return buildAllSnapshots(db, query).map(toCard);
  });

  app.get('/api/services/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const hoursParam = Number((request.query as { hours?: string }).hours ?? 24);
    const hours = HISTORY_HOURS.has(hoursParam) ? hoursParam : 24;
    const snapshot = buildServiceSnapshot(db, slug, hours);
    if (!snapshot) {
      reply.code(404);
      return { error: 'service_not_found', slug };
    }
    const runs = getConnectorRuns(db, slug, 5);
    return { ...toDetail(snapshot), recentRuns: runs };
  });

  app.get('/api/incidents', async (request) => {
    const query = request.query as { active?: string; limit?: string };
    const limit = Math.min(Number(query.limit ?? 50) || 50, 200);
    const incidents = getActiveIncidents(db, limit).map((incident) => ({
      ...incident,
      serviceName: SERVICE_NAME(db, incident.serviceSlug),
    }));
    return { count: incidents.length, incidents };
  });

  app.get('/api/events', async (request) => {
    const limit = Math.min(Number((request.query as { limit?: string }).limit ?? 50) || 50, 200);
    return getRecentEvents(db, limit);
  });

  app.get('/api/search', async (request) => {
    const raw = String((request.query as { q?: string }).q ?? '').trim();
    if (raw.length === 0) return { query: raw, results: [] };
    if (raw.length > 64) {
      return { query: raw, results: [], error: 'query_too_long' };
    }
    const results = searchCatalog(db, raw, 20);
    return { query: raw, results };
  });

  // ---------------------------------------------------------------- admin
  const requireAdmin = async (request: { headers: Record<string, unknown> }, reply: { code: (n: number) => { send: (body: unknown) => unknown } }) => {
    if (!deps.adminToken) {
      return reply.code(503).send({ error: 'admin_disabled', hint: 'Set TECHPULSE_ADMIN_TOKEN to enable the developer API.' });
    }
    const header = String(request.headers['x-admin-token'] ?? '');
    if (header !== deps.adminToken) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    return undefined;
  };

  app.get('/api/admin/overview', { preHandler: requireAdmin }, async () => {
    const rows = listServiceRows(db);
    return {
      database: countRows(db),
      services: rows.map((row) => ({
        slug: row.slug,
        name: row.name,
        category: row.category,
        connector: row.connector,
        sourceKind: row.source_kind,
        official: row.official === 1,
        confidence: row.confidence,
        pollSeconds: row.poll_seconds,
        enabled: row.enabled === 1,
        statusPage: row.status_page,
        limitation: row.limitation,
      })),
      recentRuns: getConnectorRuns(db, null, 25),
      recentEvents: getRecentEvents(db, 25),
    };
  });

  app.get('/api/admin/services/:slug', { preHandler: requireAdmin }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const row = getServiceRow(db, slug);
    if (!row) {
      reply.code(404);
      return { error: 'service_not_found', slug };
    }
    return {
      service: row,
      status: db.prepare('SELECT * FROM service_status WHERE service_slug = ?').get(slug) ?? null,
      connectivity: db.prepare('SELECT * FROM connectivity_status WHERE service_slug = ?').get(slug) ?? null,
      runs: getConnectorRuns(db, slug, 10),
      checks: db.prepare(
        'SELECT kind, target, ok, latency_ms, status_code, error, checked_at FROM checks WHERE service_slug = ? ORDER BY checked_at DESC LIMIT 25',
      ).all(slug),
    };
  });

  app.post('/api/admin/services/:slug/check', { preHandler: requireAdmin }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const definition = SERVICES.find((service) => service.slug === slug);
    if (!definition) {
      reply.code(404);
      return { error: 'service_not_found', slug };
    }
    const summary = await collectService(db, definition, loadConfig());
    return { ok: summary.connectorOk, summary };
  });

  app.post('/api/admin/services', { preHandler: requireAdmin }, async (request, reply) => {
    const body = request.body as {
      slug?: string; name?: string; category?: string; homepage?: string; connector?: string;
      connectorConfig?: Record<string, unknown>; sourceKind?: string; official?: boolean;
      confidence?: 'high' | 'medium' | 'low'; pollSeconds?: number;
      checkTargets?: { kind: string; target: string; port?: number }[];
    };

    const slug = String(body.slug ?? '').trim();
    if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) {
      reply.code(400);
      return { error: 'invalid_slug' };
    }
    if (!body.name || !body.category || !body.connector) {
      reply.code(400);
      return { error: 'missing_fields', required: ['name', 'category', 'connector'] };
    }
    const connectorIds = new Set(SERVICES.map((service) => service.connector));
    if (!connectorIds.has(body.connector as never)) {
      reply.code(400);
      return { error: 'unknown_connector', allowed: [...connectorIds] };
    }
    const categorySlugs = new Set(CATEGORIES.map((category) => category.slug));
    if (!categorySlugs.has(body.category as never)) {
      reply.code(400);
      return { error: 'unknown_category', allowed: [...categorySlugs] };
    }
    const targets = (body.checkTargets ?? []).map((target) => ({
      kind: String(target.kind ?? 'https'),
      target: String(target.target ?? ''),
      port: target.port,
    }));
    for (const target of targets) {
      if (target.kind !== 'dns' && target.kind !== 'tcp' && target.kind !== 'icmp' && !isAllowedPublicUrl(target.target)) {
        reply.code(400);
        return { error: 'unsafe_check_target', target: target.target };
      }
    }
    if (getServiceRow(db, slug)) {
      reply.code(409);
      return { error: 'service_exists', slug };
    }

    insertService(db, {
      slug,
      name: String(body.name),
      category: body.category as never,
      homepage: String(body.homepage ?? ''),
      statusPage: null,
      connector: body.connector as never,
      connectorConfig: body.connectorConfig ?? {},
      sourceKind: (body.sourceKind ?? 'official-json') as never,
      official: body.official !== false,
      confidence: body.confidence ?? 'medium',
      pollSeconds: body.pollSeconds,
      checkTargets: targets as never,
      limitation: 'Added through the admin API; verify the source before enabling.',
    }, 60);

    return { created: true, slug, note: 'Service added to the database. Catalog entries live in packages/core/src/catalog.ts and are re-seeded on every collector start.' };
  });

  app.post('/api/admin/services/:slug/enabled', { preHandler: requireAdmin }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const body = request.body as { enabled?: boolean };
    if (typeof body?.enabled !== 'boolean') {
      reply.code(400);
      return { error: 'enabled_boolean_required' };
    }
    if (!getServiceRow(db, slug)) {
      reply.code(404);
      return { error: 'service_not_found' };
    }
    setServiceEnabled(db, slug, body.enabled);
    return { slug, enabled: body.enabled };
  });

  app.delete('/api/admin/services/:slug', { preHandler: requireAdmin }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    if (SERVICES.some((service) => service.slug === slug)) {
      reply.code(400);
      return { error: 'catalog_service_cannot_be_deleted', hint: 'Disable it instead; catalog services are re-seeded on start.' };
    }
    deleteService(db, slug);
    return { deleted: true, slug };
  });

  app.get('/api/admin/sources', { preHandler: requireAdmin }, async () => {
    return {
      services: SERVICES.map((service) => ({
        slug: service.slug,
        name: service.name,
        category: service.category,
        connector: service.connector,
        sourceKind: service.sourceKind,
        statusPage: service.statusPage,
        official: service.official,
        confidence: service.confidence,
        connectorConfig: service.connectorConfig,
        checkTargets: service.checkTargets,
        limitation: service.limitation ?? null,
      })),
      categories: listCategories(db),
    };
  });

  app.post('/api/admin/test-url', { preHandler: requireAdmin }, async (request, reply) => {
    const body = request.body as { url?: string };
    const url = String(body?.url ?? '');
    if (!isAllowedPublicUrl(url)) {
      reply.code(400);
      return { error: 'url_rejected', reason: 'Only public http/https URLs on non-private hosts are allowed.' };
    }
    const { fetchResource } = await import('../../../packages/core/src/index.ts');
    const response = await fetchResource(url, { timeoutMs: 8000 });
    return {
      url,
      status: response.status,
      contentType: response.contentType,
      bytes: response.bytes,
      ms: response.ms,
      error: response.error,
      preview: response.text.slice(0, 400),
    };
  });

  app.post('/api/admin/reseed', { preHandler: requireAdmin }, async () => {
    seedCatalog(db, CATEGORIES, SERVICES, 60);
    return { reseeded: true, services: SERVICES.length };
  });

  app.get('/api/admin/settings', { preHandler: requireAdmin }, async () => {
    return collectConfigFromEnv();
  });
}

function SERVICE_NAME(db: DatabaseSync, slug: string): string {
  const row = getServiceRow(db, slug);
  return row?.name ?? slug;
}

type SnapshotLike = ReturnType<typeof buildAllSnapshots>[number];

function toCard(snapshot: SnapshotLike): Record<string, unknown> {
  return {
    slug: snapshot.service.slug,
    name: snapshot.service.name,
    category: snapshot.service.category,
    homepage: snapshot.service.homepage,
    statusPage: snapshot.service.statusPage,
    officialStatus: snapshot.officialStatus,
    officialStatusRaw: snapshot.officialStatusRaw,
    officialSourceKind: snapshot.officialSourceKind,
    officialSourceUrl: snapshot.officialSourceUrl,
    officialCheckedAt: snapshot.officialCheckedAt,
    officialConfidence: snapshot.officialConfidence,
    officialErrorMessage: snapshot.officialErrorMessage,
    connectivityStatus: snapshot.connectivityStatus,
    connectivityCheckedAt: snapshot.connectivityCheckedAt,
    latency: snapshot.latency,
    activeIncidents: snapshot.incidents.filter((incident) => incident.resolvedAt === null).length,
    componentCount: snapshot.components.length,
    limitation: snapshot.limitation ?? null,
    status: snapshot.officialStatus !== 'UNKNOWN' ? snapshot.officialStatus : snapshot.connectivityStatus,
    componentSummary: summarizeComponents(snapshot.components),
  };
}

function toDetail(snapshot: SnapshotLike): Record<string, unknown> {
  return {
    ...toCard(snapshot),
    components: snapshot.components,
    incidents: snapshot.incidents,
    maintenances: snapshot.maintenances,
    history: snapshot.history,
    officialStatusDescription: snapshot.officialStatusRaw,
  };
}

function summarizeComponents(components: { status: string }[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const component of components) {
    summary[component.status] = (summary[component.status] ?? 0) + 1;
  }
  return summary;
}

export function statusLabelFor(raw: string): string {
  return mapStatusText(raw);
}
