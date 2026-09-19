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

function maintenancePayload(status: string, scheduledFor: string | null, scheduledUntil: string | null) {
  return JSON.stringify({
    scheduled_maintenances: [
      {
        id: 'm1',
        name: 'EOS Maintenance',
        status,
        created_at: new Date(Date.now() - 86_400_000).toISOString(),
        updated_at: new Date().toISOString(),
        scheduled_for: scheduledFor,
        scheduled_until: scheduledUntil,
        description: 'Routine maintenance window.',
        components: [{ id: 'c1', name: 'API' }],
      },
    ],
  });
}

const healthyStatus = JSON.stringify({ status: { indicator: 'none', description: 'All Systems Operational' } });
const healthyComponents = JSON.stringify({
  components: [{ id: 'c1', name: 'API', status: 'operational', position: 0 }],
});

test('a maintenance window scheduled for the future never changes the current status', async () => {
  const start = new Date(Date.now() + 3 * 86_400_000);
  const end = new Date(start.getTime() + 5_400_000);
  const restore = mockFetch({
    'https://status.example/api/v2/status.json': { body: healthyStatus },
    'https://status.example/api/v2/components.json': { body: healthyComponents },
    'https://status.example/api/v2/incidents.json': { body: JSON.stringify({ incidents: [] }) },
    'https://status.example/api/v2/scheduled-maintenances.json': {
      body: maintenancePayload('scheduled', start.toISOString(), end.toISOString()),
    },
  });

  try {
    const service = { ...(SERVICE_BY_SLUG.get('epic-games')!), connectorConfig: { baseUrl: 'https://status.example' } };
    const result = await statuspageConnector.fetch({ service, log: logger, timeoutMs: 5000, now: () => new Date(), secrets: { riotApiKey: null } });

    assert.equal(result.status, 'OPERATIONAL', 'a future maintenance window is not the current status');
    assert.equal(result.metadata.maintenanceInProgress, 0);
    assert.equal(result.metadata.upcomingMaintenances, 1);
    // It is still listed as maintenance so the service page can show the calendar.
    assert.ok(result.incidents.some((incident) => incident.kind === 'maintenance'));
  } finally {
    restore();
  }
});

test('a maintenance window scheduled for the past is ignored as well', async () => {
  const start = new Date(Date.now() - 5 * 86_400_000);
  const end = new Date(start.getTime() + 5_400_000);
  const restore = mockFetch({
    'https://status.example/api/v2/status.json': { body: healthyStatus },
    'https://status.example/api/v2/components.json': { body: healthyComponents },
    'https://status.example/api/v2/incidents.json': { body: JSON.stringify({ incidents: [] }) },
    'https://status.example/api/v2/scheduled-maintenances.json': {
      body: maintenancePayload('scheduled', start.toISOString(), end.toISOString()),
    },
  });

  try {
    const service = { ...(SERVICE_BY_SLUG.get('epic-games')!), connectorConfig: { baseUrl: 'https://status.example' } };
    const result = await statuspageConnector.fetch({ service, log: logger, timeoutMs: 5000, now: () => new Date(), secrets: { riotApiKey: null } });
    assert.equal(result.status, 'OPERATIONAL');
    assert.equal(result.metadata.maintenanceInProgress, 0);
  } finally {
    restore();
  }
});

test('maintenance that is running right now is reported as maintenance', async () => {
  const restore = mockFetch({
    'https://status.example/api/v2/status.json': { body: healthyStatus },
    'https://status.example/api/v2/components.json': { body: healthyComponents },
    'https://status.example/api/v2/incidents.json': { body: JSON.stringify({ incidents: [] }) },
    'https://status.example/api/v2/scheduled-maintenances.json': {
      body: maintenancePayload('in_progress', new Date(Date.now() - 600_000).toISOString(), new Date(Date.now() + 600_000).toISOString()),
    },
  });

  try {
    const service = { ...(SERVICE_BY_SLUG.get('epic-games')!), connectorConfig: { baseUrl: 'https://status.example' } };
    const result = await statuspageConnector.fetch({ service, log: logger, timeoutMs: 5000, now: () => new Date(), secrets: { riotApiKey: null } });
    assert.equal(result.status, 'MAINTENANCE');
    assert.equal(result.metadata.maintenanceInProgress, 1);
  } finally {
    restore();
  }
});
