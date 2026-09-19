import assert from 'node:assert/strict';
import test from 'node:test';
import { CATEGORIES, SERVICES } from '../../../packages/core/src/index.ts';
import { openDatabase, saveChecks, saveConnectivity, saveConnectorResult, seedCatalog } from '../../../packages/db/src/index.ts';
import { createApp } from '../src/app.ts';

function buildApp(adminToken: string | null = null) {
  const db = openDatabase(':memory:');
  seedCatalog(db, CATEGORIES, SERVICES, 60);
  saveConnectorResult(db, 'github', {
    ok: true,
    status: 'OPERATIONAL',
    statusRaw: 'All Systems Operational',
    sourceKind: 'statuspage',
    sourceUrl: 'https://www.githubstatus.com/',
    official: true,
    confidence: 'high',
    checkedAt: new Date().toISOString(),
    components: [{ externalId: 'c1', name: 'Git Operations', group: 'Core', status: 'OPERATIONAL', statusRaw: 'operational', position: 0 }],
    incidents: [],
    regions: [],
    metadata: {},
    notes: [],
    error: null,
  });
  saveChecks(db, 'github', [
    { kind: 'https', target: 'Website', ok: true, latencyMs: 88, statusCode: 200, error: null, region: 'local', checkedAt: new Date().toISOString(), detail: null },
  ]);
  saveConnectivity(db, 'github', 'OPERATIONAL', new Date().toISOString(), { https: 88, dns: 12, tcp: 30, http: null, icmp: null }, [], 0, 1);
  const app = createApp({ db, adminToken, webOrigin: 'http://localhost:4310' });
  return { app, db };
}

test('GET /api/overview summarises the catalog', async () => {
  const { app, db } = buildApp();
  const response = await app.inject({ method: 'GET', url: '/api/overview' });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.services, SERVICES.length);
  assert.equal(body.categories.length, CATEGORIES.length);
  assert.ok(Object.keys(body.counts).includes('OPERATIONAL'));
  await app.close();
  db.close();
});

test('GET /api/services/:slug returns components, latency and history', async () => {
  const { app, db } = buildApp();
  const response = await app.inject({ method: 'GET', url: '/api/services/github' });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.slug, 'github');
  assert.equal(body.officialStatus, 'OPERATIONAL');
  assert.equal(body.components.length, 1);
  assert.equal(body.latency.https, 88);
  assert.ok(Array.isArray(body.history));
  await app.close();
  db.close();
});

test('the API exposes Arabic category names and limitation text', async () => {
  const { app, db } = buildApp();
  const categories = await app.inject({ method: 'GET', url: '/api/categories' });
  assert.equal(categories.statusCode, 200);
  const body = categories.json() as { slug: string; nameAr: string; descriptionAr: string }[];
  assert.ok(body.length >= 5);
  assert.ok(body.every((category) => category.nameAr.length > 0 && category.descriptionAr.length > 0));

  const service = await app.inject({ method: 'GET', url: '/api/services/whatsapp' });
  const detail = service.json() as { limitationAr: string | null; categoryNameAr: string };
  assert.ok(detail.limitationAr && /[\u0600-\u06FF]/.test(detail.limitationAr));
  assert.equal(detail.categoryNameAr, 'التواصل الاجتماعي');
  await app.close();
  db.close();
});

test('GET /api/services/:slug returns 404 for an unknown service', async () => {
  const { app, db } = buildApp();
  const response = await app.inject({ method: 'GET', url: '/api/services/does-not-exist' });
  assert.equal(response.statusCode, 404);
  await app.close();
  db.close();
});

test('GET /api/search finds services and components', async () => {
  const { app, db } = buildApp();
  const byService = await app.inject({ method: 'GET', url: '/api/search?q=git' });
  assert.equal(byService.statusCode, 200);
  assert.ok(byService.json().results.some((row: { slug: string }) => row.slug === 'github'));

  const byComponent = await app.inject({ method: 'GET', url: '/api/search?q=git+operations' });
  assert.ok(byComponent.json().results.some((row: { matchedOn: string }) => row.matchedOn === 'component'));
  await app.close();
  db.close();
});

test('admin routes are disabled when no token is configured', async () => {
  const { app, db } = buildApp(null);
  const response = await app.inject({ method: 'GET', url: '/api/admin/overview' });
  assert.equal(response.statusCode, 503);
  await app.close();
  db.close();
});

test('admin routes require the configured token', async () => {
  const { app, db } = buildApp('secret-token');
  const unauthorized = await app.inject({ method: 'GET', url: '/api/admin/overview' });
  assert.equal(unauthorized.statusCode, 401);

  const authorized = await app.inject({ method: 'GET', url: '/api/admin/overview', headers: { 'x-admin-token': 'secret-token' } });
  assert.equal(authorized.statusCode, 200);
  assert.equal(authorized.json().services.length, SERVICES.length);
  await app.close();
  db.close();
});

test('admin test-url rejects private and non-http targets (SSRF guard)', async () => {
  const { app, db } = buildApp('t');
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/test-url',
    headers: { 'x-admin-token': 't' },
    payload: { url: 'http://169.254.169.254/latest/meta-data' },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, 'url_rejected');
  await app.close();
  db.close();
});

test('security headers are applied to every response', async () => {
  const { app, db } = buildApp();
  const response = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.ok(String(response.headers['content-security-policy']).includes("default-src 'self'"));
  await app.close();
  db.close();
});
