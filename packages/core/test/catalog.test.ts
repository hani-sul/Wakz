import assert from 'node:assert/strict';
import test from 'node:test';
import { CATEGORIES, SERVICES, assertCatalogIntegrity, collectableServices, servicesByCategory } from '../src/catalog.ts';

test('catalog has no integrity problems', () => {
  assert.deepEqual(assertCatalogIntegrity(), []);
});

test('every category is populated and local services are scoped to Saudi Arabia', () => {
  assert.equal(CATEGORIES.length, 7);
  for (const category of CATEGORIES) {
    assert.ok(servicesByCategory(category.slug).length > 0, `${category.slug} has services`);
    assert.ok(category.nameAr.length > 0, `${category.slug} has an Arabic name`);
    assert.ok(category.descriptionAr.length > 0, `${category.slug} has an Arabic description`);
  }
  const local = CATEGORIES.find((category) => category.slug === 'local');
  assert.equal(local?.visibility, 'sa', 'the local category is only visible inside Saudi Arabia');
  assert.ok(SERVICES.filter((service) => service.category === 'local').every((service) => service.visibility === 'sa'));
});

test('every documented limitation also has an Arabic translation', () => {
  const withLimitation = SERVICES.filter((service) => service.limitation);
  assert.ok(withLimitation.length >= 15, `expected several services to document a limitation, found ${withLimitation.length}`);
  for (const service of withLimitation) {
    assert.ok(service.limitationAr && service.limitationAr.length > 10, `${service.slug}: Arabic limitation text`);
    assert.match(service.limitationAr ?? '', /[\u0600-\u06FF]/, `${service.slug}: Arabic limitation must contain Arabic characters`);
  }
});

test('every service declares check targets and a valid source policy', () => {
  assert.ok(SERVICES.length >= 38, `expected at least 38 services, found ${SERVICES.length}`);
  for (const service of SERVICES) {
    if (service.comingSoon) {
      assert.equal(service.checkTargets.length, 0, `${service.slug}: placeholders define no checks`);
      continue;
    }
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

test('placeholders are excluded from collection', () => {
  const collectable = collectableServices();
  assert.equal(collectable.length, SERVICES.filter((service) => !service.comingSoon).length);
  assert.ok(collectable.every((service) => !service.comingSoon));
});

test('services that claim an official machine-readable source have a status page or feed', () => {
  const machineReadable = new Set(['statuspage', 'statusio', 'betterstack', 'rss-feed', 'google-cloud', 'aws-health', 'xbox-status', 'nuvio-status', 'uptime-json', 'steam-api']);
  for (const service of SERVICES.filter((item) => machineReadable.has(item.connector))) {
    assert.equal(service.official, true, `${service.slug} should be flagged official`);
    assert.ok(service.statusPage || Object.keys(service.connectorConfig).length > 0, `${service.slug} needs a documented source`);
  }
});
