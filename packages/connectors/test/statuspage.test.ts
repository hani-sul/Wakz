import assert from 'node:assert/strict';
import test from 'node:test';
import { statuspageConnector } from '../src/statuspage.ts';
import { SERVICE_BY_SLUG, createLogger } from '../../core/src/index.ts';
import { fixture, mockFetch } from './helpers.ts';

const logger = createLogger('error');

test('statuspage connector maps a healthy page (GitHub fixtures)', async () => {
  const restore = mockFetch({
    'https://status.example/api/v2/status.json': { body: await fixture('statuspage-github-status.json') },
    'https://status.example/api/v2/components.json': { body: await fixture('statuspage-github-components.json') },
    'https://status.example/api/v2/incidents.json': { body: await fixture('statuspage-github-incidents.json') },
    'https://status.example/api/v2/scheduled-maintenances.json': { body: JSON.stringify({ scheduled_maintenances: [] }) },
  });

  try {
    const service = { ...(SERVICE_BY_SLUG.get('github')!), connectorConfig: { baseUrl: 'https://status.example' } };
    const result = await statuspageConnector.fetch({ service, log: logger, timeoutMs: 5000, now: () => new Date(), secrets: { riotApiKey: null } });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'OPERATIONAL');
    assert.equal(result.statusRaw, 'All Systems Operational');
    assert.ok(result.components.length > 5, 'components were parsed');
    assert.ok(result.components.every((component) => component.statusRaw.length > 0));
    assert.equal(result.sourceKind, 'statuspage');
    assert.equal(result.official, true);
  } finally {
    restore();
  }
});

test('statuspage connector applies a component filter (Fortnite within Epic Games)', async () => {
  const components = await fixture('statuspage-epicgames-components.json');
  const restore = mockFetch({
    'https://status.example/api/v2/status.json': { body: JSON.stringify({ status: { indicator: 'none', description: 'All Systems Operational' } }) },
    'https://status.example/api/v2/components.json': { body: components },
    'https://status.example/api/v2/incidents.json': { body: JSON.stringify({ incidents: [] }) },
    'https://status.example/api/v2/scheduled-maintenances.json': { body: JSON.stringify({ scheduled_maintenances: [] }) },
  });

  try {
    const service = {
      ...(SERVICE_BY_SLUG.get('fortnite')!),
      connectorConfig: { baseUrl: 'https://status.example', componentFilter: ['fortnite'] },
    };
    const result = await statuspageConnector.fetch({ service, log: logger, timeoutMs: 5000, now: () => new Date(), secrets: { riotApiKey: null } });

    assert.equal(result.status, 'OPERATIONAL');
    assert.ok(result.components.length > 0, 'fortnite components matched');
    assert.ok(result.components.every((component) => component.name.toLowerCase().includes('fortnite')));
    assert.equal(result.metadata.filterApplied, true);
  } finally {
    restore();
  }
});

test('statuspage connector reports UNKNOWN rather than OPERATIONAL when the source fails', async () => {
  const restore = mockFetch({});
  try {
    const service = { ...(SERVICE_BY_SLUG.get('vercel')!), connectorConfig: { baseUrl: 'https://status.example' } };
    const result = await statuspageConnector.fetch({ service, log: logger, timeoutMs: 2000, now: () => new Date(), secrets: { riotApiKey: null } });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'UNKNOWN');
    assert.ok(result.error);
  } finally {
    restore();
  }
});
