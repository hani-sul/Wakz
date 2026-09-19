/**
 * Diagnostic: compares what the Epic Games status page publishes with what our connector derives.
 * Usage: node tools/research/check-epic.mjs
 */
import { SERVICE_BY_SLUG, createLogger } from '../../packages/core/src/index.ts';
import { statuspageConnector } from '../../packages/connectors/src/statuspage.ts';

const base = 'https://status.epicgames.com';

for (const path of ['/api/v2/status.json', '/api/v2/components.json', '/api/v2/incidents.json', '/api/v2/scheduled-maintenances.json']) {
  const response = await fetch(base + path, { headers: { accept: 'application/json', 'user-agent': 'TechPulseResearch/0.1' } });
  const text = await response.text();
  console.log(`\n=== ${path} (HTTP ${response.status}, ${text.length} bytes)`);
  try {
    const json = JSON.parse(text);
    if (json.status) console.log('status:', JSON.stringify(json.status));
    if (json.components) {
      const bad = json.components.filter((c) => c.status !== 'operational');
      console.log(`components: ${json.components.length} total, non-operational: ${bad.length}`);
      for (const component of bad.slice(0, 10)) console.log(`   - ${component.name}: ${component.status}`);
    }
    if (json.incidents) {
      const open = json.incidents.filter((i) => i.status !== 'resolved');
      console.log(`incidents: ${json.incidents.length} total, unresolved: ${open.length}`);
      for (const incident of open.slice(0, 5)) {
        console.log(`   - [${incident.status}/${incident.impact}] ${incident.name} (updated ${incident.updated_at})`);
      }
    }
    if (json.scheduled_maintenances) {
      console.log(`scheduled_maintenances: ${json.scheduled_maintenances.length}`);
      for (const maintenance of json.scheduled_maintenances.slice(0, 6)) {
        console.log(`   - [${maintenance.status}] ${maintenance.name} | scheduled_for=${maintenance.scheduled_for} until=${maintenance.scheduled_until}`);
      }
    }
  } catch {
    console.log(text.slice(0, 200));
  }
}

const service = SERVICE_BY_SLUG.get('epic-games');
const result = await statuspageConnector.fetch({
  service,
  log: createLogger('error'),
  timeoutMs: 15000,
  now: () => new Date(),
  secrets: { riotApiKey: null },
});
console.log('\n=== our connector result');
console.log(JSON.stringify({
  status: result.status,
  statusRaw: result.statusRaw,
  metadata: result.metadata,
  nonOperationalComponents: result.components.filter((c) => c.status !== 'OPERATIONAL').slice(0, 8).map((c) => `${c.name}=${c.statusRaw}`),
  unresolvedIncidents: result.incidents.filter((i) => i.resolvedAt === null).slice(0, 5).map((i) => `${i.title}=${i.status}`),
}, null, 2));
