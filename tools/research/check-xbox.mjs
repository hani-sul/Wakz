/**
 * Diagnostics for the Xbox xnotify endpoint: compares the payload returned to the
 * research user-agent with the one returned to the collector user-agent.
 */
const url = 'https://xnotify.xboxlive.com/servicestatusv6/US/en-US';

for (const agent of [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'TechPulse/0.1 (+https://github.com/techpulse/status-aggregator)',
]) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': agent, accept: 'application/json, text/xml, */*' }, signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    console.log(`\nUA=${agent.slice(0, 24)} status=${response.status} type=${response.headers.get('content-type')} bytes=${text.length}`);
    console.log(text.slice(0, 320).replace(/\s+/g, ' '));
  } catch (error) {
    console.log(`\nUA=${agent.slice(0, 24)} FAILED ${error?.cause?.code ?? error?.message}`);
  }
}

// Structure dump + fixture capture for the JSON representation.
const response = await fetch(url, {
  headers: { 'user-agent': 'TechPulseResearch/0.1 (+status-aggregator-research)', accept: 'application/json' },
  signal: AbortSignal.timeout(15000),
});
const payload = await response.json();
console.log('\ntop-level keys:', Object.keys(payload).join(', '));
console.log('CoreServices type:', Array.isArray(payload.CoreServices) ? `array(${payload.CoreServices.length})` : typeof payload.CoreServices);
console.log('first category:', JSON.stringify(payload.CoreServices?.[0])?.slice(0, 400));
for (const key of Object.keys(payload)) {
  const value = payload[key];
  if (Array.isArray(value)) console.log(`${key}: array(${value.length})`);
  else if (value && typeof value === 'object') console.log(`${key}: object keys=[${Object.keys(value).join(',')}]`);
}

const { writeFile, mkdir } = await import('node:fs/promises');
const path = await import('node:path');
const fixtures = path.resolve(import.meta.dirname, '..', '..', 'packages', 'connectors', 'test', 'fixtures');
await mkdir(fixtures, { recursive: true });
await writeFile(path.join(fixtures, 'xbox-servicestatusv6.json'), JSON.stringify(payload, null, 2), 'utf8');
console.log('\nfixture written: packages/connectors/test/fixtures/xbox-servicestatusv6.json');
