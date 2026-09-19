import assert from 'node:assert/strict';
import test from 'node:test';
import { SERVICE_BY_SLUG, createLogger } from '../../core/src/index.ts';
import { statusIoConnector } from '../src/statusio.ts';
import { betterStackConnector } from '../src/betterstack.ts';
import { googleCloudConnector } from '../src/google-cloud.ts';
import { awsHealthConnector } from '../src/aws-health.ts';
import { xboxStatusConnector } from '../src/xbox-status.ts';
import { nuvioStatusConnector } from '../src/nuvio-status.ts';
import { uptimeJsonConnector } from '../src/uptime-json.ts';
import { rssFeedConnector } from '../src/rss-feed.ts';
import { steamApiConnector } from '../src/steam-api.ts';
import { connectivityConnector } from '../src/connectivity.ts';
import { fixture, fixtureBuffer, mockFetch } from './helpers.ts';

const logger = createLogger('error');
const ctxFor = (slug: string, overrides: Record<string, unknown> = {}) => {
  const service = { ...(SERVICE_BY_SLUG.get(slug)!), connectorConfig: { ...SERVICE_BY_SLUG.get(slug)!.connectorConfig, ...overrides } };
  return { service, log: logger, timeoutMs: 5000, now: () => new Date('2026-09-19T04:00:00.000Z'), secrets: { riotApiKey: null } };
};

test('status.io (Roblox) parses overall status and containers', async () => {
  const restore = mockFetch({
    'https://api.status.io/1.0/status/59db90dbcdeb2f04dadcf16d': { body: await fixture('statusio-roblox-status.json') },
  });
  try {
    const result = await statusIoConnector.fetch(ctxFor('roblox'));
    assert.equal(result.ok, true);
    assert.equal(result.status, 'OPERATIONAL');
    assert.equal(result.statusRaw, 'Operational');
    assert.ok(result.components.length >= 5);
    assert.equal(result.metadata.statusCode, 100);
  } finally {
    restore();
  }
});

test('better stack (Hugging Face) reads aggregate_state and resources', async () => {
  const restore = mockFetch({
    'https://status.huggingface.co/index.json': { body: await fixture('betterstack-huggingface-index.json') },
  });
  try {
    const result = await betterStackConnector.fetch(ctxFor('hugging-face'));
    assert.equal(result.ok, true);
    assert.equal(result.status, 'OPERATIONAL');
    assert.equal(result.metadata.aggregateState, 'operational');
    assert.ok(result.components.length > 0, 'status_page_resource entries became components');
    assert.ok(result.notes.includes('provider=better-stack'));
  } finally {
    restore();
  }
});

test('google cloud connector keeps only matching products for Gemini', async () => {
  const restore = mockFetch({
    'https://status.cloud.google.com/incidents.json': { body: await fixture('google-cloud-incidents.json') },
  });
  try {
    const result = await googleCloudConnector.fetch(ctxFor('google-ai-gemini'));
    assert.equal(result.ok, true);
    assert.equal(result.metadata.productFilterApplied, true);
    assert.ok((result.metadata.relevantIncidents as number) <= (result.metadata.incidentsInFeed as number));
    for (const incident of result.incidents) {
      assert.ok(incident.components.some((component) => /vertex|gemini|generative language|ai platform/i.test(component)));
    }
  } finally {
    restore();
  }
});

test('google cloud connector reports OPERATIONAL when nothing is active', async () => {
  const incidents = JSON.parse(await fixture('google-cloud-incidents.json')) as { end?: string }[];
  const closed = incidents.map((incident) => ({ ...incident, end: '2026-09-01T00:00:00Z' }));
  const restore = mockFetch({
    'https://status.cloud.google.com/incidents.json': { body: JSON.stringify(closed) },
  });
  try {
    const result = await googleCloudConnector.fetch(ctxFor('google-cloud'));
    assert.equal(result.status, 'OPERATIONAL');
    assert.equal(result.metadata.activeIncidents, 0);
  } finally {
    restore();
  }
});

test('AWS health connector decodes the UTF-16 feed and derives regions', async () => {
  const restore = mockFetch({
    'https://health.aws.amazon.com/public/currentevents': {
      body: await fixtureBuffer('aws-health-currentevents.json'),
      contentType: 'application/json;charset=utf-16',
    },
  });
  try {
    const result = await awsHealthConnector.fetch(ctxFor('aws'));
    assert.equal(result.ok, true);
    assert.ok((result.metadata.events as number) >= 1, 'events were decoded');
    assert.ok(result.regions.length >= 1);
    assert.equal(result.metadata.feedEncoding, 'UTF-16');
    assert.ok(['OPERATIONAL', 'DEGRADED', 'MAJOR_OUTAGE', 'PARTIAL_OUTAGE', 'MAINTENANCE'].includes(result.status));
  } finally {
    restore();
  }
});

test('xbox connector parses the official xnotify XML', async () => {
  const restore = mockFetch({
    'https://xnotify.xboxlive.com/servicestatusv6/US/en-US': { body: await fixture('xbox-servicestatusv6.xml'), contentType: 'text/xml' },
  });
  try {
    const result = await xboxStatusConnector.fetch(ctxFor('xbox-network'));
    assert.equal(result.ok, true);
    assert.equal(result.status, 'OPERATIONAL');
    assert.equal(result.statusRaw, 'None');
    assert.ok(result.components.length >= 5, 'core service categories parsed');
    assert.ok(result.components.some((component) => component.name.toLowerCase().includes('account')));
  } finally {
    restore();
  }
});

test('xbox connector prefers the JSON representation when the source returns it', async () => {
  const restore = mockFetch({
    'https://xnotify.xboxlive.com/servicestatusv6/US/en-US': { body: await fixture('xbox-servicestatusv6.json'), contentType: 'application/json' },
  });
  try {
    const result = await xboxStatusConnector.fetch(ctxFor('xbox-network'));
    assert.equal(result.ok, true);
    assert.equal(result.status, 'OPERATIONAL');
    assert.equal(result.metadata.representation, 'json');
    assert.ok(result.components.length >= 9, 'core service categories parsed from JSON');
    assert.ok(result.components.some((component) => component.name.includes('Account')));
  } finally {
    restore();
  }
});

test('nuvio connector maps the status API payload', async () => {
  const restore = mockFetch({
    'https://status.nuvio.tv/api/status': { body: await fixture('nuvio-status.json') },
  });
  try {
    const result = await nuvioStatusConnector.fetch(ctxFor('nuvio'));
    assert.equal(result.ok, true);
    assert.equal(result.status, 'OPERATIONAL');
    assert.ok(result.components.length > 0);
    assert.ok(result.metadata.componentCount);
  } finally {
    restore();
  }
});

test('uptime JSON connector (Trakt) maps monitors to components', async () => {
  const restore = mockFetch({
    'https://status.trakt.tv/api/getMonitorList/wVLWNFLGN9': { body: await fixture('trakt-monitors.json') },
    'https://status.trakt.tv/api/getEventFeed/wVLWNFLGN9': { body: await fixture('trakt-events.json') },
  });
  try {
    const result = await uptimeJsonConnector.fetch(ctxFor('trakt'));
    assert.equal(result.ok, true);
    assert.equal(result.status, 'OPERATIONAL');
    assert.ok(result.components.length >= 2);
    assert.ok(result.components.some((component) => component.group === 'API'));
  } finally {
    restore();
  }
});

test('RSS connector (DeepSeek) marks resolved entries as operational', async () => {
  const restore = mockFetch({
    'https://status.deepseek.com/feed.rss': { body: await fixture('deepseek-feed.rss'), contentType: 'application/rss+xml' },
  });
  try {
    const result = await rssFeedConnector.fetch(ctxFor('deepseek'));
    assert.equal(result.ok, true);
    assert.equal(result.status, 'OPERATIONAL');
    assert.ok(result.incidents.length > 0);
    assert.ok(result.incidents.every((incident) => incident.resolvedAt !== null), 'all fixture entries are resolved');
  } finally {
    restore();
  }
});

test('RSS connector treats an empty feed as no active incident (Azure)', async () => {
  const restore = mockFetch({
    'https://azure.status.microsoft/en-us/status/feed/': { body: await fixture('azure-feed.rss'), contentType: 'text/xml' },
  });
  try {
    const result = await rssFeedConnector.fetch(ctxFor('microsoft-azure'));
    assert.equal(result.status, 'OPERATIONAL');
    assert.equal(result.metadata.emptyFeed, true);
  } finally {
    restore();
  }
});

test('TMDB RSS component reports become components', async () => {
  const restore = mockFetch({
    'https://status.themoviedb.org/rss': { body: await fixture('tmdb-feed.rss'), contentType: 'application/rss+xml' },
  });
  try {
    const result = await rssFeedConnector.fetch(ctxFor('tmdb'));
    assert.equal(result.ok, true);
    assert.equal(result.components.length, 3);
    assert.ok(result.components.every((component) => component.status === 'OPERATIONAL'));
  } finally {
    restore();
  }
});

test('steam connector uses the official Web API as a liveness signal only', async () => {
  const restore = mockFetch({
    'https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/': { body: await fixture('steam-serverinfo.json') },
  });
  try {
    const result = await steamApiConnector.fetch(ctxFor('steam'));
    assert.equal(result.status, 'OPERATIONAL');
    assert.ok(String(result.statusRaw).includes('Web API responding'));
    assert.equal(result.incidents.length, 0);
    assert.ok(result.notes.some((note) => note.includes('no official status/incident feed')));
  } finally {
    restore();
  }
});

test('connectivity connector never claims an official status', async () => {
  const result = await connectivityConnector.fetch(ctxFor('x'));
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.statusRaw, null);
  assert.equal(result.official, false);
  assert.ok(result.notes.some((note) => note.includes('official status unknown')));
});
