import assert from 'node:assert/strict';
import test from 'node:test';
import { SERVICE_BY_SLUG, createLogger } from '../../core/src/index.ts';
import { instatusConnector } from '../src/instatus.ts';
import { mockFetch } from './helpers.ts';

const logger = createLogger('error');

function context() {
  const service = SERVICE_BY_SLUG.get('salla')!;
  return { service, log: logger, timeoutMs: 5000, now: () => new Date(), secrets: { riotApiKey: null } };
}

test('instatus connector maps a healthy page (Salla)', async () => {
  const restore = mockFetch({
    'https://status.salla.com/summary.json': {
      body: JSON.stringify({ page: { name: 'Salla Platform', url: 'https://status.salla.com', status: 'UP' } }),
    },
  });
  try {
    const result = await instatusConnector.fetch(context());
    assert.equal(result.ok, true);
    assert.equal(result.status, 'OPERATIONAL');
    assert.equal(result.metadata.pageName, 'Salla Platform');
  } finally {
    restore();
  }
});

test('instatus connector reports an outage and keeps incidents', async () => {
  const restore = mockFetch({
    'https://status.salla.com/summary.json': {
      body: JSON.stringify({
        page: { name: 'Salla Platform', status: 'DOWN' },
        activeIncidents: [{ id: 'i1', name: 'Storefront unavailable', status: 'investigating', impact: 'DOWN', started: new Date().toISOString() }],
      }),
    },
  });
  try {
    const result = await instatusConnector.fetch(context());
    assert.equal(result.status, 'MAJOR_OUTAGE');
    assert.equal(result.incidents.length, 1);
    assert.equal(result.incidents[0]?.kind, 'incident');
  } finally {
    restore();
  }
});

test('instatus connector surfaces maintenance with its end time', async () => {
  const start = new Date(Date.now() - 600_000).toISOString();
  const end = new Date(Date.now() + 600_000).toISOString();
  const restore = mockFetch({
    'https://status.salla.com/summary.json': {
      body: JSON.stringify({
        page: { name: 'Salla Platform', status: 'UNDERMAINTENANCE' },
        activeMaintenances: [{ id: 'm1', name: 'Database upgrade', status: 'scheduled', start, end }],
      }),
    },
  });
  try {
    const result = await instatusConnector.fetch(context());
    assert.equal(result.status, 'MAINTENANCE');
    const maintenance = result.incidents.find((incident) => incident.kind === 'maintenance');
    assert.equal(maintenance?.endsAt, end);
  } finally {
    restore();
  }
});
