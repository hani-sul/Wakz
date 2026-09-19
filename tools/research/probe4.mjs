/**
 * TechPulse — Phase 1, fourth pass: JS-bundle endpoint discovery for the providers
 * whose status pages are client-rendered (Riot, Roblox, Meta, PlayStation, Xbox,
 * Nintendo, EA, Blizzard) plus direct probes of the candidate data paths.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(ROOT, 'tools', 'research', 'probe4-report.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIMEOUT_MS = 20000;
const MAX_JS = 8;
const MAX_BYTES = 4_000_000;

const BUNDLE_TARGETS = [
  { service: 'Riot Games', url: 'https://status.riotgames.com/' },
  { service: 'Roblox', url: 'https://status.roblox.com/' },
  { service: 'Meta', url: 'https://metastatus.com/' },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/en-us/' },
  { service: 'Xbox Network', url: 'https://support.xbox.com/en-US/xbox-live-status' },
  { service: 'Nintendo Network', url: 'https://support.nintendo.com/status' },
  { service: 'EA', url: 'https://www.ea.com/service-updates' },
  { service: 'Battle.net', url: 'https://account.battle.net/status' },
];

const DIRECT_PROBES = [
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/us.json' },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/all.json' },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/statuses.json' },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/index.json' },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/sa.json' },
  { service: 'Roblox', url: 'https://status.roblox.com/10/status' },
  { service: 'Roblox', url: 'https://status.roblox.com/pages/incident/' },
  { service: 'Roblox', url: 'https://status.roblox.com/api/1.0/status' },
  { service: 'TikTok', url: 'https://ads.tiktok.com/status' },
  { service: 'TikTok', url: 'https://status.tiktok.com/en/' },
  { service: 'Battle.net', url: 'https://account.battle.net/status/api' },
  { service: 'Minecraft', url: 'https://api.minecraftservices.com/status' },
  { service: 'Steam', url: 'https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/?format=json' },
];

const KEYWORDS = ['xnotify', 'metrics/', 'getMonitorList', 'status.io', 'api/', '/graphql', 'graphql', 'servicestatus', 'service-status', 'statuspage', 'status_base_url'];

async function get(url, raw = false) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': UA, accept: '*/*', 'accept-language': 'en-US,en;q=0.9' },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.subarray(0, raw ? MAX_BYTES : 400_000).toString('utf8');
  return { status: res.status, type: res.headers.get('content-type') ?? '', text, bytes: buf.length };
}

function endpointsIn(text) {
  const out = new Set();
  for (const m of text.matchAll(/https?:\/\/[A-Za-z0-9_\-.:@/%~?=&${}]*/g)) {
    const u = m[0];
    if (u.length > 200) continue;
    if (!/(api|graphql|status|incident|xnotify|health|json)/i.test(u)) continue;
    if (/\.(png|jpg|jpeg|svg|css|woff2?|ico|webp|gif|map)(\?|$)/i.test(u)) continue;
    if (/(googleapis|gstatic|jquery|cloudflareinsights|fonts\.)/i.test(u)) continue;
    out.add(u);
  }
  for (const m of text.matchAll(/["'`](\/[A-Za-z0-9_\-./${}]*(?:api|graphql|status|incident|xnotify)[A-Za-z0-9_\-./${}]*)["'`]/gi)) {
    const u = m[1];
    if (u.length > 160) continue;
    out.add(u);
  }
  return [...out].slice(0, 30);
}

async function inspect(target) {
  const row = { service: target.service, url: target.url, status: 0, error: null, endpoints: [], keywordHits: {} };
  try {
    const html = await get(target.url);
    row.status = html.status;
    const scripts = [...html.text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]).slice(0, MAX_JS);
    const endpoints = new Set(endpointsIn(html.text));
    const hits = {};
    for (const kw of KEYWORDS) {
      const re = new RegExp(`.{0,80}${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.{0,80}`, 'gi');
      const found = html.text.match(re);
      if (found) hits[`html:${kw}`] = found.slice(0, 3).map((s) => s.replace(/\s+/g, ' '));
    }
    for (const src of scripts) {
      let abs;
      try { abs = new URL(src, target.url).toString(); } catch { continue; }
      try {
        const js = await get(abs, true);
        for (const ep of endpointsIn(js.text)) endpoints.add(ep);
        for (const kw of KEYWORDS) {
          const re = new RegExp(`.{0,80}${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.{0,80}`, 'gi');
          const found = js.text.match(re);
          if (found) hits[`${abs.split('/').pop()}:${kw}`] = found.slice(0, 3).map((s) => s.replace(/\s+/g, ' '));
        }
      } catch (err) {
        hits[`error:${src}`] = [err?.cause?.code ?? err?.message].slice(0, 1);
      }
    }
    row.endpoints = [...endpoints];
    row.keywordHits = hits;
  } catch (err) {
    row.error = err?.cause?.code ?? err?.name ?? String(err);
  }
  return row;
}

async function probe(url) {
  try {
    const res = await get(url);
    return { url, status: res.status, type: res.type, bytes: res.bytes, sample: res.text.replace(/\s+/g, ' ').slice(0, 220) };
  } catch (err) {
    return { url, status: 0, type: '', bytes: 0, error: err?.cause?.code ?? err?.name ?? String(err), sample: '' };
  }
}

async function main() {
  const report = { generatedAt: new Date().toISOString(), bundles: [], probes: [] };
  for (const target of BUNDLE_TARGETS) {
    const row = await inspect(target);
    report.bundles.push(row);
    console.log(`\n===== ${row.service} (${row.status || row.error}) ${row.url}`);
    for (const ep of row.endpoints) console.log(`   ep: ${ep}`);
    for (const [key, values] of Object.entries(row.keywordHits)) {
      console.log(`   [${key}]`);
      for (const v of values) console.log(`      ${v.slice(0, 190)}`);
    }
  }
  console.log('\n===== DIRECT PROBES =====');
  for (const p of DIRECT_PROBES) {
    const row = await probe(p.url);
    report.probes.push({ service: p.service, ...row });
    console.log(`${String(row.status || row.error).padEnd(11)} ${String(row.type).split(';')[0].padEnd(20)} ${String(row.bytes).padStart(8)}B ${row.url}`);
    if (row.sample && row.status < 400) console.log(`            ${row.sample.slice(0, 180)}`);
  }
  await writeFile(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log('\nreport -> tools/research/probe4-report.json');
}

await main();
