/**
 * TechPulse — Phase 1, second pass.
 *
 * For status pages that ship as JavaScript apps, this pass extracts the API endpoints
 * they actually call (by scanning the page HTML and the JS bundles it references),
 * re-decodes the AWS health feed (UTF-16), and prints small bodies for inspection.
 *
 * Usage: node tools/research/probe2.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'tools', 'research');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIMEOUT_MS = 20000;
const MAX_JS = 6;
const MAX_JS_BYTES = 3_000_000;

const PAGES = [
  { service: 'PlayStation Network', url: 'https://status.playstation.com/en-us/' },
  { service: 'Riot Games', url: 'https://status.riotgames.com/' },
  { service: 'Roblox', url: 'https://status.roblox.com/' },
  { service: 'DeepSeek', url: 'https://status.deepseek.com/' },
  { service: 'Hugging Face', url: 'https://status.huggingface.co/' },
  { service: 'Meta (WhatsApp/Instagram/Facebook)', url: 'https://metastatus.com/' },
  { service: 'TMDB', url: 'https://status.themoviedb.org/' },
  { service: 'Trakt', url: 'https://status.trakt.tv/' },
  { service: 'Simkl', url: 'https://status.simkl.com/' },
  { service: 'Xbox Network', url: 'https://support.xbox.com/en-US/xbox-live-status' },
  { service: 'Nintendo Network', url: 'https://support.nintendo.com/status' },
  { service: 'EA', url: 'https://www.ea.com/service-updates' },
  { service: 'TikTok', url: 'https://www.tiktok.com/status' },
  { service: 'Nuvio', url: 'https://status.nuvio.tv/' },
];

const EXTRA_ENDPOINTS = [
  'https://status.openai.com/api/v2/summary.json',
  'https://status.deepseek.com/api/status',
  'https://status.deepseek.com/summary',
  'https://status.deepseek.com/index.json',
  'https://metastatus.com/api/v1/status',
  'https://metastatus.com/status.json',
  'https://metastatus.com/data.json',
  'https://status.roblox.com/api/v1/status',
  'https://status.roblox.com/status.json',
  'https://status.playstation.com/data/statuses/psn.json',
  'https://status.playstation.com/api/status',
  'https://status.riotgames.com/api/v1/status/na',
  'https://www.minecraft.net/en-us/status',
  'https://api.mojang.com/',
  'https://status.battle.net/',
  'https://www.blizzard.com/en-us/support/status/',
  'https://status.huggingface.co/api/status',
  'https://status.trakt.tv/api/status',
  'https://status.simkl.com/api/status',
  'https://status.themoviedb.org/api/status',
  'https://api.twitterstat.us/api/v2/status.json',
  'https://steamstat.us/api',
];

const ENDPOINT_RE = /["'`]((?:https?:\/\/[^"'`\s<>]+)|(?:\/[A-Za-z0-9_\-/.{}$:]*))["'`]/g;
const INTERESTING = /(api|graphql|status|incident|summar|health|rss|json)/i;

function hostOf(url) {
  try { return new URL(url).host; } catch { return ''; }
}

async function get(url, asBuffer = false) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'user-agent': UA,
      accept: 'text/html,application/json,*/*',
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  if (asBuffer) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, type: res.headers.get('content-type') ?? '', buf };
  }
  return { status: res.status, type: res.headers.get('content-type') ?? '', text: await res.text() };
}

function extractEndpoints(text, baseUrl, host) {
  const found = new Set();
  for (const match of text.matchAll(ENDPOINT_RE)) {
    const raw = match[1];
    if (!INTERESTING.test(raw)) continue;
    if (raw.length > 160) continue;
    let value = raw;
    if (value.startsWith('/')) {
      try { value = new URL(value, baseUrl).toString(); } catch { continue; }
    }
    if (!/^https?:/.test(value)) continue;
    if (!hostOf(value).endsWith(host) && !/(statuspage|instatus|status\.io|statuspal|atlassian)/i.test(value)) continue;
    if (/\.(png|jpg|svg|css|woff2?|ico|webp)(\?|$)/i.test(value)) continue;
    found.add(value);
  }
  return [...found];
}

async function inspectPage(page) {
  const out = { service: page.service, url: page.url, status: 0, error: null, scripts: [], endpoints: [], notes: [] };
  try {
    const host = hostOf(page.url);
    const res = await get(page.url);
    out.status = res.status;
    const html = res.text ?? '';
    const htmlEndpoints = extractEndpoints(html, page.url, host);
    for (const key of ['statuspage', 'instatus', 'status.io', 'statuspal', '__NEXT_DATA__', 'window.__', 'graphql']) {
      if (html.toLowerCase().includes(key.toLowerCase())) out.notes.push(key);
    }
    const scriptSrcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
    out.scripts = scriptSrcs.slice(0, MAX_JS);
    const jsEndpoints = new Set(htmlEndpoints);
    for (const src of out.scripts) {
      let abs;
      try { abs = new URL(src, page.url).toString(); } catch { continue; }
      try {
        const js = await get(abs);
        const body = (js.text ?? '').slice(0, MAX_JS_BYTES);
        for (const ep of extractEndpoints(body, page.url, host)) jsEndpoints.add(ep);
      } catch (err) {
        out.notes.push(`js-error:${src}:${err?.cause?.code ?? err?.message}`);
      }
    }
    out.endpoints = [...jsEndpoints].slice(0, 40);
  } catch (err) {
    out.error = err?.cause?.code ?? err?.name ?? String(err);
  }
  return out;
}

async function probeExtra(url) {
  const row = { url, status: 0, type: '', bytes: 0, error: null, sample: '' };
  try {
    const res = await get(url);
    row.status = res.status;
    row.type = res.type;
    row.bytes = (res.text ?? '').length;
    row.sample = (res.text ?? '').replace(/\s+/g, ' ').slice(0, 240);
  } catch (err) {
    row.error = err?.cause?.code ?? err?.name ?? String(err);
  }
  return row;
}

async function awsHealth() {
  const res = await get('https://health.aws.amazon.com/public/currentevents', true);
  const buf = res.buf;
  let text = buf.toString('utf8');
  if (buf.length > 1 && buf[0] === 0xff && buf[1] === 0xfe) text = buf.subarray(2).toString('utf16le');
  else if (buf.length > 1 && buf[0] === 0xfe && buf[1] === 0xff) text = buf.subarray(2).swap16().toString('utf16le');
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  return {
    status: res.status,
    bytes: buf.length,
    decoded: text.slice(0, 400).replace(/\s+/g, ' '),
    topLevelKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : null,
    sample: parsed ? JSON.stringify(parsed, null, 2).slice(0, 1500) : null,
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const report = { generatedAt: new Date().toISOString(), pages: [], extra: [], aws: null, azureFeed: '' };

  for (const page of PAGES) {
    const result = await inspectPage(page);
    report.pages.push(result);
    console.log(`\n== ${result.service} (${result.status || result.error}) ${result.url}`);
    if (result.notes.length) console.log(`   notes: ${[...new Set(result.notes)].join(', ')}`);
    for (const ep of result.endpoints) console.log(`   -> ${ep}`);
  }

  console.log('\n===== EXTRA ENDPOINT PROBES =====');
  for (const url of EXTRA_ENDPOINTS) {
    const row = await probeExtra(url);
    report.extra.push(row);
    console.log(`${String(row.status || row.error).padEnd(12)} ${String(row.type).split(';')[0].padEnd(18)} ${String(row.bytes).padStart(8)}B  ${row.url}`);
    if (row.status && row.status !== 404 && row.sample) console.log(`             ${row.sample.slice(0, 160)}`);
  }

  console.log('\n===== AWS HEALTH FEED =====');
  report.aws = await awsHealth();
  console.log(JSON.stringify({ status: report.aws.status, bytes: report.aws.bytes, topLevelKeys: report.aws.topLevelKeys }, null, 2));
  console.log(report.aws.decoded);

  const azure = await get('https://azure.status.microsoft/en-us/status/feed/');
  report.azureFeed = azure.text ?? '';
  console.log('\n===== AZURE RSS FEED =====');
  console.log(report.azureFeed.slice(0, 800));

  await writeFile(path.join(OUT_DIR, 'probe2-report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('\nreport -> tools/research/probe2-report.json');
}

await main();
