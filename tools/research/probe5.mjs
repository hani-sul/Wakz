/**
 * TechPulse — Phase 1, fifth pass: close the last gaps
 * (Xbox xnotify, PlayStation region feed, Riot /api/v2 slugs, Meta metrics,
 * Roblox status.io page id, Nintendo/EA/Battle.net data surfaces).
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const RAW = path.join(ROOT, 'tools', 'research', 'raw');
const OUT = path.join(ROOT, 'tools', 'research', 'probe5-report.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIMEOUT_MS = 20000;

const PROBES = [
  { service: 'Xbox Network', url: 'https://xnotify.xboxlive.com/servicestatusv6', headers: { accept: 'application/json' } },
  { service: 'Xbox Network', url: 'https://xnotify.xboxlive.com/servicestatusv5' },
  { service: 'Xbox Network', url: 'https://notifications.support.xboxlive.com/incidents' },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/statuses/region/us.json' },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/statuses/region/na.json' },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/statuses/region/eu.json' },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/data/statuses/region/jp.json' },
  { service: 'PlayStation Network', url: 'https://status.playstation.com/config/app.json' },
  { service: 'Riot Games', url: 'https://status.riotgames.com/api/v2/na' },
  { service: 'Riot Games', url: 'https://status.riotgames.com/api/v2/league-of-legends' },
  { service: 'Riot Games', url: 'https://status.riotgames.com/api/v2/valorant' },
  { service: 'Meta', url: 'https://metastatus.com/metrics/metrics/metrics.json' },
  { service: 'Roblox', url: 'https://api.status.io/1.0/status/3bfgx408Mgfc' },
  { service: 'Roblox', url: 'https://status.roblox.com/1.0/status' },
  { service: 'Nintendo Network', url: 'https://support.nintendo.com/status' },
  { service: 'Battle.net', url: 'https://account.battle.net/status' },
];

const JS_TARGETS = [
  { label: 'riot-chunk', url: 'https://status.riotgames.com/static/js/2.51e5f21c.chunk.js', grep: [/\{[^{}]{0,400}na["']?:\s*["'][^"']+["'][^{}]{0,400}\}/g, /Be\s*=\s*\{[^}]{0,600}\}/g] },
  { label: 'metastatus-index', url: 'https://metastatus.com/_next/static/chunks/pages/index-CGjuBb2H.js', grep: [/getS3MetricsData\([^)]{0,120}\)/g, /["'`]metrics\/[^"'`]{0,80}["'`]/g] },
];

const RAW_GREPS = [
  { file: 'roblox__root.html', patterns: [/[0-9a-f]{24}/g, /statuspage_id[^,;]{0,60}/gi, /"id":"?[A-Za-z0-9]{6,30}/g] },
  { file: 'nintendo-network__status.html', patterns: [/maintenance[^<]{0,120}/gi, /operational[^<]{0,80}/gi, /network status[^<]{0,80}/gi, /data-[a-z-]+=["'][^"']{0,60}["']/gi] },
  { file: 'ea__service-updates.html', patterns: [/__NEXT_DATA__/g, /"serviceUpdates?"[^,]{0,80}/g, /window\.nds\.[A-Za-z]+\s*=\s*'[^']*'/g] },
  { file: 'xbox-network__en-us-xbox-live-status.html', patterns: [/xnotify[^"']{0,80}/gi, /script[^>]{0,200}/gi] },
  { file: 'playstation-network__en-us.html', patterns: [/\{region:[^}]{0,60}\}/g, /region["']?\s*[:=]\s*["'][^"']+["']/gi] },
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
    let text = buf.toString('utf8');
    if (buf.length > 1 && buf[0] === 0xff && buf[1] === 0xfe) text = buf.subarray(2).toString('utf16le');
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
  } catch (err) {
    row.error = err?.cause?.code ?? err?.name ?? String(err);
  }
  return row;
}

async function grepRemote(target) {
  const out = { label: target.label, url: target.url, status: 0, matches: [], error: null };
  try {
    const res = await fetch(target.url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': UA } });
    out.status = res.status;
    const text = (await res.text()).slice(0, 4_000_000);
    for (const re of target.grep) {
      const found = text.match(re);
      if (found) out.matches.push(...found.slice(0, 6).map((s) => s.replace(/\s+/g, ' ').slice(0, 400)));
    }
  } catch (err) {
    out.error = err?.cause?.code ?? err?.name ?? String(err);
  }
  return out;
}

async function grepRaw(entry) {
  const text = await readFile(path.join(RAW, entry.file), 'utf8').catch(() => '');
  const result = { file: entry.file, matches: [] };
  for (const re of entry.patterns) {
    const found = text.match(re);
    if (found) result.matches.push(...found.slice(0, 8).map((s) => s.replace(/\s+/g, ' ').slice(0, 300)));
  }
  return result;
}

async function main() {
  const report = { generatedAt: new Date().toISOString(), probes: [], jsGreps: [], rawGreps: [] };

  console.log('===== PROBES =====');
  for (const target of PROBES) {
    const row = await probe(target);
    report.probes.push(row);
    console.log(`\n${String(row.status || row.error).padEnd(11)} ${row.url}`);
    if (row.keys) console.log(`   keys: ${JSON.stringify(row.keys)}`);
    if (row.status && row.status < 400) console.log(`   ${row.sample.slice(0, 320)}`);
  }

  console.log('\n===== JS BUNDLE GREPS =====');
  for (const target of JS_TARGETS) {
    const row = await grepRemote(target);
    report.jsGreps.push(row);
    console.log(`\n-- ${row.label} (${row.status || row.error})`);
    for (const m of row.matches) console.log(`   ${m.slice(0, 300)}`);
  }

  console.log('\n===== RAW FILE GREPS =====');
  for (const entry of RAW_GREPS) {
    const row = await grepRaw(entry);
    report.rawGreps.push(row);
    console.log(`\n-- ${row.file}`);
    for (const m of row.matches.slice(0, 10)) console.log(`   ${m.slice(0, 220)}`);
  }

  await writeFile(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log('\nreport -> tools/research/probe5-report.json');
}

await main();
