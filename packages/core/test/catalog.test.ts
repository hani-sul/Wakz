import assert from 'node:assert/strict';
import test from 'node:test';
import { CATEGORIES, SERVICES, assertCatalogIntegrity, servicesByCategory } from '../src/catalog.ts';

test('catalog has no integrity problems', () => {
  assert.deepEqual(assertCatalogIntegrity(), []);
});

test('all five categories are populated', () => {
  assert.equal(CATEGORIES.length, 5);
  for (const category of CATEGORIES) {
    assert.ok(servicesByCategory(category.slug).length > 0, `${category.slug} has services`);
  }
});

test('every service declares check targets and a valid source policy', () => {
  assert.ok(SERVICES.length >= 38, `expected at least 38 services, found ${SERVICES.length}`);
  for (const service of SERVICES) {
    assert.ok(service.checkTargets.length > 0, `${service.slug}: check targets`);
    for (const target of service.checkTargets) {
      assert.ok(['http', 'https', 'dns', 'tcp', 'icmp'].includes(target.kind), `${service.slug}: ${target.kind}`);
      assert.ok(target.target.length > 0, `${service.slug}: empty target`);
    }
    if (service.connector === 'connectivity') {
      assert.ok(service.limitation, `${service.slug}: connectivity-only services must document why`);
    }
  }
});

test('services that claim an official machine-readable source have a status page or feed', () => {
  const machineReadable = new Set(['statuspage', 'statusio', 'betterstack', 'rss-feed', 'google-cloud', 'aws-health', 'xbox-status', 'nuvio-status', 'uptime-json', 'steam-api']);
  for (const service of SERVICES.filter((item) => machineReadable.has(item.connector))) {
    assert.equal(service.official, true, `${service.slug} should be flagged official`);
    assert.ok(service.statusPage || Object.keys(service.connectorConfig).length > 0, `${service.slug} needs a documented source`);
  }
});
