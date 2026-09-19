/**
 * TechPulse — Phase 1, final verification pass.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(ROOT, 'tools', 'research', 'probe6-report.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIMEOUT_MS = 20000;

const PROBES = [
  // status.io public API with the page id found inside Roblox's own status page
  { service: 'Roblox', url: 'https://api.status.io/1.0/status/59db90dbcdeb2f04dadcf16d' },
  { service: 'Roblox', url: 'https://api.status.io/1.0/summary/59db90dbcdeb2f04dadcf16d' },
  // Xbox xnotify market/locale variants
  { service: 'Xbox Network', url: 'https://xnotify.xboxlive.com/servicestatusv6/US/en-US' },
  { service: 'Xbox Network', url: 'https://xnotify.xboxlive.com/servicestatusv6/us/en-us' },
  { service: 'Xbox Network', url: 'https://xnotify.xboxlive.com/servicestatusv5/US/en-US' },
  { service: 'Xbox Network', url: 'https://xnotify.xboxlive.com/servicestatusv4/US/en-US' },
  // PlayStation data path variants
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/statuses/region/americas.json' },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/statuses/region/en-us.json' },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/statuses/region/US.json', headers: { 'X-User-Geo-Country': 'US' } },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/statuses/region/us.json', headers: { 'X-User-Geo-Country': 'US' } },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/statuses/region/all.json' },
  // Meta
  { service: 'Meta', url: 'https://metastatus.com/' },
  // Nintendo
  { service: 'Nintendo Network', url: 'https://www.nintendo.com/us/support/network-status/' },
  { service: 'Nintendo Network', url: 'https://www.nintendo.co.jp/netinfo/ja_JP/index.html' },
  { service: 'Nintendo Network', url: 'https://en-americas-support.nintendo.com/app/answers/detail/a_id/26154' },
  // Blizzard / Battle.net
  { service: 'Battle.net', url: 'https://account.battle.net/api/status' },
  { service: 'Battle.net', url: 'https://status.battle.net/' },
  // Ubisoft
  { service: 'Ubisoft', url: 'https://www.ubisoft.com/en-us/help/status' },
  { service: 'Ubisoft', url: 'https://ubi.li/status' },
];

const POSTS = [
  {
    service: 'EA', url: 'https://service-aggregation-layer.juno.ea.com/graphql',
    body: { query: '{__typename}' }, headers: { 'content-type': 'application/json' },
  },
];

async function probe(target) {
  const row = { service: target.service, url: target.url, status: 0, type: '', bytes: 0, keys: null, error: null, sample: '' };
  try {
    const res = await fetch(target.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': UA, accept: '*/*', ...(target.headers ?? {}) },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.toString('utf8');
    row.status = res.status;
    row.type = res.headers.get('content-type') ?? '';
    row.bytes = buf.length;
    row.sample = text.replace(/\s+/g, ' ').slice(0, 400);
    if (/json/i.test(row.type)) {
      try {
        const parsed = JSON.parse(text);
        row.keys = Array.isArray(parsed) ? `array(${parsed.length})` : Object.keys(parsed).slice(0, 20);
      } catch { row.keys = 'unparsed'; }
    }
    if (target.url.includes('metastatus.com')) {
      const build = text.match(/"buildId":"([^"]+)"/);
      row.buildId = build?.[1] ?? null;
    }
  } catch (err) {
    row.error = err?.cause?.code ?? err?.name ?? String(err);
  }
  return row;
}

async function post(target) {
  const row = { service: target.service, url: target.url, status: 0, error: null, sample: '' };
  try {
    const res = await fetch(target.url, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': UA, 'content-type': 'application/json', ...(target.headers ?? {}) },
      body: JSON.stringify(target.body),
    });
    row.status = res.status;
    row.sample = (await res.text()).replace(/\s+/g, ' ').slice(0, 500);
  } catch (err) {
    row.error = err?.cause?.code ?? err?.name ?? String(err);
  }
  return row;
}

async function main() {
  const report = { generatedAt: new Date().toISOString(), probes: [], posts: [], followUps: [] };

  console.log('===== PROBES =====');
  for (const target of PROBES) {
    const row = await probe(target);
    report.probes.push(row);
    console.log(`\n${String(row.status || row.error).padEnd(11)} ${row.url}`);
    if (row.keys) console.log(`   keys: ${JSON.stringify(row.keys)}`);
    if (row.status && row.status < 400) console.log(`   ${row.sample.slice(0, 300)}`);
    if (row.buildId) {
      const nextData = `https://metastatus.com/_next/data/${row.buildId}/index.json`;
      const follow = await probe({ service: 'Meta', url: nextData });
      report.followUps.push(follow);
      console.log(`   [follow-up] ${follow.status || follow.error} ${nextData}`);
      if (follow.status < 400) console.log(`   ${follow.sample.slice(0, 300)}`);
    }
  }

  console.log('\n===== POSTS =====');
  for (const target of POSTS) {
    const row = await post(target);
    report.posts.push(row);
    console.log(`\n${String(row.status || row.error).padEnd(11)} ${row.url}`);
    console.log(`   ${row.sample.slice(0, 300)}`);
  }

  await writeFile(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log('\nreport -> tools/research/probe6-report.json');
}

await main();
