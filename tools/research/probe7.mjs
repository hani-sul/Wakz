/**
 * TechPulse — Phase 1, close-out pass: PlayStation region feed, EA GraphQL schema,
 * Ubisoft status API, Nintendo network info content.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(ROOT, 'tools', 'research', 'probe7-report.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIMEOUT_MS = 20000;

const PS_HEADERS = { 'X-User-Geo-Country': 'US', referer: 'https://status.playstation.com/en-us/', origin: 'https://status.playstation.com', accept: 'application/json, text/plain, */*' };

const PROBES = [
  { service: 'PlayStation Network', url: 'https://status.playstation.com/config/app.json', full: true },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/config/regions.json' },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/config/status.json' },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/statuses/region/us.json', headers: PS_HEADERS },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/statuses/region/US.json', headers: PS_HEADERS },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/statuses/region/americas.json', headers: PS_HEADERS },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/statuses/region/1.json', headers: PS_HEADERS },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/statuses.json', headers: PS_HEADERS },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/status.json', headers: PS_HEADERS },
  { service: 'Ubisoft', url: 'https://www.ubisoft.com/en-us/help/status' },
  { service: 'Nintendo Network', url: 'https://www.nintendo.co.jp/netinfo/ja_JP/index.html' },
];

async function request(url, init = {}) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': UA, accept: '*/*', ...(init.headers ?? {}) },
    method: init.method ?? 'GET',
    body: init.body,
  });
  const text = await res.text();
  return { status: res.status, type: res.headers.get('content-type') ?? '', text };
}

async function probe(target) {
  const row = { service: target.service, url: target.url, status: 0, type: '', error: null, sample: '', keys: null };
  try {
    const res = await request(target.url, { headers: target.headers });
    row.status = res.status;
    row.type = res.type;
    row.sample = res.text.replace(/\s+/g, ' ').slice(0, target.full ? 4000 : 400);
    if (/json/i.test(res.type)) {
      try {
        const parsed = JSON.parse(res.text);
        row.keys = Array.isArray(parsed) ? `array(${parsed.length})` : Object.keys(parsed).slice(0, 25);
      } catch { row.keys = 'unparsed'; }
    }
  } catch (err) {
    row.error = err?.cause?.code ?? err?.name ?? String(err);
  }
  return row;
}

async function eaIntrospection() {
  const query = `query IntrospectionQuery { __schema { queryType { fields { name description } } } }`;
  try {
    const res = await request('https://service-aggregation-layer.juno.ea.com/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    let names = [];
    try {
      const parsed = JSON.parse(res.text);
      names = parsed?.data?.__schema?.queryType?.fields?.map((f) => f.name) ?? [];
      return { status: res.status, fieldCount: names.length, names, raw: res.text.slice(0, 400) };
    } catch {
      return { status: res.status, fieldCount: 0, names: [], raw: res.text.slice(0, 400) };
    }
  } catch (err) {
    return { status: 0, error: err?.cause?.code ?? err?.message, names: [] };
  }
}

async function ubisoftBundle() {
  const out = { endpoints: [], notes: [] };
  try {
    const page = await request('https://www.ubisoft.com/en-us/help/status');
    const scripts = [...page.text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]).slice(0, 6);
    const urls = new Set();
    for (const src of scripts) {
      let abs;
      try { abs = new URL(src, 'https://www.ubisoft.com/en-us/help/status').toString(); } catch { continue; }
      try {
        const js = await request(abs);
        for (const m of js.text.matchAll(/https?:\/\/[A-Za-z0-9_\-.:@/%~?=&${}]*/g)) {
          const u = m[0];
          if (u.length > 200) continue;
          if (!/(status|incident|api|graphql)/i.test(u)) continue;
          if (/\.(png|jpg|svg|css|woff2?|ico|map)/i.test(u)) continue;
          if (/(googleapis|gstatic|jquery|fonts\.|w3\.org)/i.test(u)) continue;
          urls.add(u);
        }
      } catch (err) {
        out.notes.push(`${src}:${err?.message}`);
      }
    }
    out.endpoints = [...urls].slice(0, 30);
  } catch (err) {
    out.notes.push(String(err?.message));
  }
  return out;
}

async function main() {
  const report = { generatedAt: new Date().toISOString(), probes: [], ea: null, ubisoft: null };
  const nintendoMaintenance = { url: 'https://www.nintendo.co.jp/netinfo/ja_JP/index.html', snippet: '', entryCount: 0 };

  for (const target of PROBES) {
    const row = await probe(target);
    report.probes.push(row);
    console.log(`\n${String(row.status || row.error).padEnd(11)} ${row.url}`);
    if (row.keys) console.log(`   keys: ${JSON.stringify(row.keys)}`);
    if (row.status && row.status < 400) console.log(`   ${row.sample.slice(0, target.full ? 2500 : 300)}`);
    if (target.service === 'Nintendo Network' && row.status === 200) {
      nintendoMaintenance.snippet = row.sample.slice(0, 1200);
      nintendoMaintenance.entryCount = (row.sample.match(/maintenance/gi) ?? []).length;
    }
  }

  console.log('\n===== EA GRAPHQL SCHEMA =====');
  report.ea = await eaIntrospection();
  console.log(`status=${report.ea.status} fields=${report.ea.fieldCount}`);
  console.log(report.ea.names.slice(0, 40).join(', '));
  if (!report.ea.fieldCount) console.log(report.ea.raw);

  console.log('\n===== UBISOFT BUNDLE SCAN =====');
  report.ubisoft = await ubisoftBundle();
  for (const ep of report.ubisoft.endpoints) console.log(`   ${ep}`);
  for (const note of report.ubisoft.notes) console.log(`   ! ${note}`);

  report.nintendoMaintenance = nintendoMaintenance;
  await writeFile(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log('\nreport -> tools/research/probe7-report.json');
}

await main();
