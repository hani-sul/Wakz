import assert from 'node:assert/strict';
import test from 'node:test';
import { CATEGORIES, SERVICES } from '../../core/src/index.ts';
import { openDatabase } from '../src/database.ts';
import {
  countRows,
  getActiveIncidents,
  getComponents,
  getIncidents,
  getStatusHistory,
  getStatusMap,
  insertService,
  saveChecks,
  saveConnectivity,
  saveConnectorResult,
  searchCatalog,
  seedCatalog,
  setServiceEnabled,
} from '../src/repositories.ts';
import type { ConnectorResult } from '../../core/src/types.ts';

function freshDb() {
  const db = openDatabase(':memory:');
  seedCatalog(db, CATEGORIES, SERVICES, 60);
  return db;
}

function result(overrides: Partial<ConnectorResult> = {}): ConnectorResult {
  return {
    ok: true,
    status: 'OPERATIONAL',
    statusRaw: 'All Systems Operational',
    sourceKind: 'statuspage',
    sourceUrl: 'https://status.example/',
    official: true,
    confidence: 'high',
    checkedAt: new Date().toISOString(),
    components: [{ externalId: 'c1', name: 'API', group: 'Core', status: 'OPERATIONAL', statusRaw: 'operational', position: 0 }],
    incidents: [{
      externalId: 'i1', kind: 'incident', title: 'Elevated errors', status: 'investigating', statusRaw: 'investigating',
      impact: 'DEGRADED', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), resolvedAt: null,
      description: 'we are investigating', url: null, components: ['API'],
    }],
    regions: [],
    metadata: {},
    notes: [],
    error: null,
    ...overrides,
  };
}

test('seeding creates every catalog service plus its status rows', () => {
  const db = freshDb();
  const counts = countRows(db);
  assert.equal(counts.services, SERVICES.length);
  assert.equal(counts.categories, CATEGORIES.length);
  assert.equal(counts.components, 0);
  const statuses = getStatusMap(db);
  assert.equal(statuses.size, SERVICES.length);
  assert.ok([...statuses.values()].every((row) => row.status === 'UNKNOWN'));
  db.close();
});

test('saving a connector result stores status, components and incidents', () => {
  const db = freshDb();
  saveConnectorResult(db, 'github', result());

  const status = getStatusMap(db).get('github');
  assert.equal(status?.status, 'OPERATIONAL');
  assert.equal(status?.source_kind, 'statuspage');

  const components = getComponents(db, 'github');
  assert.equal(components.length, 1);
  assert.equal(components[0]?.name, 'API');

  const incidents = getIncidents(db, 'github', 'incident');
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0]?.impact, 'DEGRADED');

  const active = getActiveIncidents(db);
  assert.equal(active.length, 1);
  assert.equal(active[0]?.serviceSlug, 'github');
  db.close();
});

test('status history only grows when the status actually changes', () => {
  const db = freshDb();
  saveConnectorResult(db, 'github', result({ checkedAt: '2026-09-19T10:00:00.000Z' }));
  saveConnectorResult(db, 'github', result({ checkedAt: '2026-09-19T10:05:00.000Z' }));
  saveConnectorResult(db, 'github', result({ status: 'DEGRADED', checkedAt: '2026-09-19T10:10:00.000Z' }));

  const history = getStatusHistory(db, 'github', 24 * 365);
  assert.equal(history.length, 2);
  assert.equal(history[1]?.status, 'DEGRADED');
  db.close();
});

test('checks and connectivity are stored separately from official status', () => {
  const db = freshDb();
  saveConnectorResult(db, 'steam', result({ status: 'OPERATIONAL', sourceKind: 'official-api' }));
  saveChecks(db, 'steam', [
    { kind: 'https', target: 'Store', ok: true, latencyMs: 42, statusCode: 200, error: null, region: 'local', checkedAt: new Date().toISOString(), detail: null },
    { kind: 'dns', target: 'steamcommunity.com', ok: true, latencyMs: 18, statusCode: null, error: null, region: 'local', checkedAt: new Date().toISOString(), detail: null },
  ]);
  saveConnectivity(db, 'steam', 'DEGRADED', new Date().toISOString(), { https: 1500, dns: 18 }, ['latency 1500 ms above 900 ms'], 0, 1);

  assert.equal(countRows(db).checks, 2);
  const official = getStatusMap(db).get('steam');
  assert.equal(official?.status, 'OPERATIONAL', 'official status is untouched by our checks');
  db.close();
});

test('components are replaced, not duplicated, between runs', () => {
  const db = freshDb();
  saveConnectorResult(db, 'github', result());
  saveConnectorResult(db, 'github', result({
    components: [
      { externalId: 'c1', name: 'API v2', group: 'Core', status: 'DEGRADED', statusRaw: 'degraded_performance', position: 0 },
      { externalId: 'c2', name: 'Webhooks', group: 'Core', status: 'OPERATIONAL', statusRaw: 'operational', position: 1 },
    ],
  }));

  const components = getComponents(db, 'github');
  assert.equal(components.length, 2);
  assert.equal(components.find((component) => component.externalId === 'c1')?.name, 'API v2');
  db.close();
});

test('search finds services, components and categories', () => {
  const db = freshDb();
  saveConnectorResult(db, 'github', result({
    components: [{ externalId: 'c9', name: 'Codespaces', group: null, status: 'OPERATIONAL', statusRaw: 'operational', position: 0 }],
  }));

  assert.ok(searchCatalog(db, 'git').some((row) => row.slug === 'github' && row.matchedOn === 'service'));
  assert.ok(searchCatalog(db, 'codespace').some((row) => row.matchedOn === 'component' && row.detail === 'Codespaces'));
  assert.ok(searchCatalog(db, 'gaming').some((row) => row.matchedOn === 'category'));
  db.close();
});

test('admin-added services can be enabled and disabled', () => {
  const db = freshDb();
  insertService(db, {
    slug: 'example-service',
    name: 'Example Service',
    category: 'cloud',
    homepage: 'https://example.com',
    statusPage: null,
    connector: 'connectivity',
    connectorConfig: {},
    sourceKind: 'official-page',
    official: true,
    confidence: 'low',
    checkTargets: [{ kind: 'https', target: 'https://example.com' }],
    limitation: 'Added by test.',
  }, 60);

  assert.equal(countRows(db).services, SERVICES.length + 1);
  setServiceEnabled(db, 'example-service', false);
  const row = db.prepare('SELECT enabled FROM services WHERE slug = ?').get('example-service') as { enabled: number };
  assert.equal(row.enabled, 0);
  db.close();
});
