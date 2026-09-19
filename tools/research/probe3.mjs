/**
 * TechPulse — Phase 1, third pass: resolve the remaining ambiguous providers.
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const RAW_DIR = path.join(ROOT, 'tools', 'research', 'raw');
const OUT = path.join(ROOT, 'tools', 'research', 'probe3-report.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIMEOUT_MS = 20000;

const TARGETS = [
  // PlayStation: config discovered in pass 2
  { service: 'PlayStation Network', url: 'https://status.playstation.com/config/app.json' },
  // Riot status page API surface
  { service: 'Riot Games', url: 'https://status.riotgames.com/api/v2/' },
  { service: 'Riot Games', url: 'https://status.riotgames.com/api/v2/status' },
  { service: 'Riot Games', url: 'https://status.riotgames.com/api/v2/products' },
  // status.io public API (Roblox)
  { service: 'Roblox', url: 'https://api.status.io/1.0/status/594b89535ab9a70b1600006b' },
  { service: 'Roblox', url: 'https://status.roblox.com/1.0/status/594b89535ab9a70b1600006b' },
  // Better Stack (Hugging Face)
  { service: 'Hugging Face', url: 'https://status.huggingface.co/index.json' },
  { service: 'Hugging Face', url: 'https://status.huggingface.co/sections' },
  { service: 'Hugging Face', url: 'https://status.huggingface.co/feed.rss' },
  // DeepSeek (flashcat statuspage)
  { service: 'DeepSeek', url: 'https://status.deepseek.com/feed.rss' },
  // Uptime-style JSON APIs (Trakt / Simkl)
  { service: 'Trakt', url: 'https://status.trakt.tv/api/getMonitorList/wVLWNFLGN9' },
  { service: 'Trakt', url: 'https://status.trakt.tv/api/getEventFeed/wVLWNFLGN9' },
  { service: 'Simkl', url: 'https://status.simkl.com/api/getMonitorList/Nx8xTN71j' },
  { service: 'Simkl', url: 'https://status.simkl.com/api/getEventFeed/Nx8xTN71j' },
  // Site24x7 / StatusIQ (TMDB)
  { service: 'TMDB', url: 'https://status.themoviedb.org/rss' },
  // Meta
  { service: 'Meta', url: 'https://metastatus.com/metrics/1/1.json' },
  { service: 'Meta', url: 'https://metastatus.com/metrics/official/official.json' },
  // Nuvio
  { service: 'Nuvio', url: 'https://status.nuvio.tv/api/status' },
  { service: 'Nuvio', url: 'https://api.nuvio.tv/' },
  // Remaining "does an official status surface exist?" checks
  { service: 'X', url: 'https://status.x.com/' },
  { service: 'X', url: 'https://developer.x.com/en/support/x-api/status' },
  { service: 'Battle.net', url: 'https://us.forums.blizzard.com/en/blizzard/' },
  { service: 'Battle.net', url: 'https://account.battle.net/status' },
  { service: 'Minecraft', url: 'https://status.minecraft.net/' },
  { service: 'Minecraft', url: 'https://api.minecraftservices.com/' },
  { service: 'TikTok', url: 'https://www.tiktok.com/status' },
  { service: 'EA', url: 'https://www.ea.com/api/graphql' },
  { service: 'Xbox Network', url: 'https://support.xbox.com/Help/XnotifyServiceStatus/SmsCountryCodes' },
];

const RAW_SCAN = [
  { label: 'Xbox support page', file: 'xbox-network__en-us-xbox-live-status.html', patterns: [
    /https?:\/\/[^"'\s<>]* xnotify/gi,
  ], generic: /(xnotify|servicestatus|service-status|serviceStatus)/gi },
  { label: 'Meta status page', file: 'whatsapp__root.html', generic: /(metric|\.json|api)/gi },
];

async function get(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': UA, accept: '*/*', 'accept-language': 'en-US,en;q=0.9' },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  let text = buf.toString('utf8');
  if (buf.length > 1 && buf[0] === 0xff && buf[1] === 0xfe) text = buf.subarray(2).toString('utf16le');
  return { status: res.status, type: res.headers.get('content-type') ?? '', text, bytes: buf.length, finalUrl: res.url };
}

async function probe(target) {
  const row = { service: target.service, url: target.url, status: 0, type: '', bytes: 0, error: null, sample: '', keys: null };
  try {
    const res = await get(target.url);
    row.status = res.status;
    row.type = res.type;
    row.bytes = res.bytes;
    row.sample = res.text.replace(/\s+/g, ' ').slice(0, 300);
    if (/json/i.test(res.type)) {
      try {
        const parsed = JSON.parse(res.text);
        row.keys = Array.isArray(parsed) ? `array(${parsed.length})` : Object.keys(parsed).slice(0, 15);
      } catch { row.keys = 'unparsed'; }
    }
  } catch (err) {
    row.error = err?.cause?.code ?? err?.name ?? String(err);
  }
  return row;
}

async function scanRaw() {
  const files = await readdir(RAW_DIR).catch(() => []);
  const found = [];
  for (const file of files) {
    if (!file.endsWith('.html')) continue;
    const text = await readFile(path.join(RAW_DIR, file), 'utf8').catch(() => '');
    if (!/roblox|playstation|riot|xbox|meta|tiktok|ea-|nintendo|deepseek/i.test(file)) continue;
    const urls = new Set();
    for (const m of text.matchAll(/https?:\/\/[^"'\s<>\\)]+/g)) {
      const u = m[0];
      if (!/(api|graphql|json|xnotify|status)/i.test(u)) continue;
      if (/\.(png|jpg|jpeg|svg|css|woff2?|ico|webp|gif)/i.test(u)) continue;
      if (/site24x7static|betterstack|flashcat/i.test(u)) continue;
      urls.add(u);
    }
    found.push({ file, candidates: [...urls].slice(0, 25) });
  }
  return found;
}

async function main() {
  await mkdir(path.dirname(OUT), { recursive: true });
  const report = { generatedAt: new Date().toISOString(), probes: [], rawScan: [] };

  console.log('===== PROBES =====');
  for (const target of TARGETS) {
    const row = await probe(target);
    report.probes.push(row);
    const status = row.status || row.error;
    console.log(`\n${String(status).padEnd(10)} ${row.url}`);
    if (row.keys) console.log(`   keys: ${JSON.stringify(row.keys)}`);
    if (row.status && row.status < 400) console.log(`   ${row.sample.slice(0, 260)}`);
  }

  console.log('\n===== RAW HTML SCAN =====');
  report.rawScan = await scanRaw();
  for (const entry of report.rawScan) {
    console.log(`\n-- ${entry.file}`);
    for (const c of entry.candidates) console.log(`   ${c}`);
  }

  await writeFile(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log('\nreport -> tools/research/probe3-report.json');
}

await main();
