/**
 * TechPulse — Phase 1 data-source probe.
 *
 * Fetches every candidate status endpoint for the tracked services, stores the raw
 * response body for inspection, and prints a compact classification report.
 *
 * Usage: node tools/research/probe.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const RAW_DIR = path.join(ROOT, 'tools', 'research', 'raw');
const REPORT_PATH = path.join(ROOT, 'tools', 'research', 'probe-report.json');
const UA = 'TechPulseResearch/0.1 (+status-aggregator-research)';
const TIMEOUT_MS = 20000;
const CONCURRENCY = 6;

const CANDIDATES = [
  // --- Gaming ---
  { service: 'Steam', category: 'Gaming', urls: [
    'https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/',
    'https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v0001/?format=json',
    'https://steamstat.us/',
  ] },
  { service: 'PlayStation Network', category: 'Gaming', urls: [
    'https://status.playstation.com/',
    'https://status.playstation.com/data/statuses/region/US.json',
    'https://status.playstation.com/data/statuses/continent/all.json',
    'https://status.playstation.com/en-us/',
  ] },
  { service: 'Xbox Network', category: 'Gaming', urls: [
    'https://support.xbox.com/en-US/xbox-live-status',
    'https://status.xbox.com/',
    'https://www.xbox.com/en-US/status',
  ] },
  { service: 'Nintendo Network', category: 'Gaming', urls: [
    'https://www.nintendo.com/us/support/network-status/',
    'https://www.nintendo.com/us/status/',
    'https://support.nintendo.com/status',
    'https://www.nintendo.co.uk/Support/Nintendo-Switch/Network-Status/Network-Status-1201171.html',
  ] },
  { service: 'Epic Games', category: 'Gaming', urls: [
    'https://status.epicgames.com/api/v2/status.json',
    'https://status.epicgames.com/api/v2/components.json',
    'https://status.epicgames.com/api/v2/incidents.json',
  ] },
  { service: 'Fortnite', category: 'Gaming', urls: [
    'https://status.epicgames.com/api/v2/components.json',
  ] },
  { service: 'Riot Games', category: 'Gaming', urls: [
    'https://status.riotgames.com/',
    'https://status.riotgames.com/api/status',
    'https://status.riotgames.com/data/status.json',
    'https://na1.api.riotgames.com/lol/status/v4/platform-data',
  ] },
  { service: 'EA', category: 'Gaming', urls: [
    'https://www.ea.com/service-updates',
    'https://help.ea.com/en/service-updates/',
    'https://status.ea.com/',
  ] },
  { service: 'Ubisoft', category: 'Gaming', urls: [
    'https://status.ubisoft.com/',
    'https://www.ubisoft.com/en-us/help/connectivity-and-performance',
    'https://ubisoft-status.com/',
  ] },
  { service: 'Battle.net', category: 'Gaming', urls: [
    'https://status.blizzard.com/',
    'https://us.battle.net/support/en/status',
    'https://www.blizzard.com/en-us/support/status',
  ] },
  { service: 'Roblox', category: 'Gaming', urls: [
    'https://status.roblox.com/',
    'https://status.roblox.com/v1/status',
    'https://status.roblox.com/api/status',
  ] },
  { service: 'Minecraft', category: 'Gaming', urls: [
    'https://status.mojang.com/check',
    'https://status.mojang.com/',
    'http://status.mojang.com/check',
    'https://launchermeta.mojang.com/mc/game/version_manifest.json',
  ] },
  { service: 'Discord', category: 'Gaming', urls: [
    'https://discordstatus.com/api/v2/status.json',
    'https://discordstatus.com/api/v2/components.json',
    'https://discordstatus.com/api/v2/incidents.json',
  ] },
  // --- AI ---
  { service: 'OpenAI', category: 'AI', urls: [
    'https://status.openai.com/api/v2/status.json',
    'https://status.openai.com/api/v2/components.json',
    'https://status.openai.com/api/v2/incidents.json',
  ] },
  { service: 'Anthropic Claude', category: 'AI', urls: [
    'https://status.anthropic.com/api/v2/status.json',
    'https://status.claude.com/api/v2/status.json',
    'https://status.claude.com/api/v2/components.json',
    'https://status.claude.com/api/v2/incidents.json',
  ] },
  { service: 'Google AI Gemini', category: 'AI', urls: [
    'https://status.cloud.google.com/incidents.json',
    'https://status.cloud.google.com/products/vertex-ai.json',
    'https://status.cloud.google.com/products.json',
  ] },
  { service: 'DeepSeek', category: 'AI', urls: [
    'https://status.deepseek.com/',
    'https://status.deepseek.com/api/v2/status.json',
    'https://status.deepseek.com/summary.json',
    'https://status.deepseek.com/history.rss',
  ] },
  { service: 'Groq', category: 'AI', urls: [
    'https://groqstatus.com/api/v2/status.json',
    'https://groqstatus.com/api/v2/components.json',
    'https://groqstatus.com/api/v2/incidents.json',
  ] },
  { service: 'Hugging Face', category: 'AI', urls: [
    'https://status.huggingface.co/api/v2/status.json',
    'https://status.huggingface.co/',
    'https://status.huggingface.co/api/v2/components.json',
  ] },
  // --- Cloud / Infrastructure ---
  { service: 'Cloudflare', category: 'Cloud', urls: [
    'https://www.cloudflarestatus.com/api/v2/status.json',
    'https://www.cloudflarestatus.com/api/v2/components.json',
    'https://www.cloudflarestatus.com/api/v2/incidents.json',
  ] },
  { service: 'GitHub', category: 'Cloud', urls: [
    'https://www.githubstatus.com/api/v2/status.json',
    'https://www.githubstatus.com/api/v2/components.json',
    'https://www.githubstatus.com/api/v2/incidents.json',
  ] },
  { service: 'AWS', category: 'Cloud', urls: [
    'https://status.aws.amazon.com/data.json',
    'https://status.aws.amazon.com/rss/all.rss',
    'https://health.aws.amazon.com/public/currentevents',
    'https://health.aws.amazon.com/public/events',
  ] },
  { service: 'Microsoft Azure', category: 'Cloud', urls: [
    'https://azure.status.microsoft/en-us/status/feed/',
    'https://azure.status.microsoft/en-us/status/',
    'https://rssfeed.azure.status.microsoft/en-us/status/feed/',
  ] },
  { service: 'Google Cloud', category: 'Cloud', urls: [
    'https://status.cloud.google.com/incidents.json',
    'https://status.cloud.google.com/',
  ] },
  { service: 'Vercel', category: 'Cloud', urls: [
    'https://www.vercel-status.com/api/v2/status.json',
    'https://www.vercel-status.com/api/v2/components.json',
    'https://www.vercel-status.com/api/v2/incidents.json',
  ] },
  { service: 'DigitalOcean', category: 'Cloud', urls: [
    'https://status.digitalocean.com/api/v2/status.json',
    'https://status.digitalocean.com/api/v2/components.json',
    'https://status.digitalocean.com/api/v2/incidents.json',
  ] },
  // --- Social ---
  { service: 'WhatsApp', category: 'Social', urls: [
    'https://metastatus.com/',
    'https://metastatus.com/api/status',
    'https://www.metastatus.com/api/v2/status.json',
  ] },
  { service: 'Instagram', category: 'Social', urls: [
    'https://metastatus.com/',
    'https://developers.facebook.com/status/dashboard/',
  ] },
  { service: 'Facebook', category: 'Social', urls: [
    'https://metastatus.com/',
    'https://developers.facebook.com/status/dashboard/',
  ] },
  { service: 'X', category: 'Social', urls: [
    'https://api.x.com/2/openapi.json',
    'https://status.twitter.com/',
    'https://api.twitterstat.us/',
  ] },
  { service: 'TikTok', category: 'Social', urls: [
    'https://status.tiktok.com/',
    'https://www.tiktok.com/status',
    'https://developers.tiktok.com/status',
  ] },
  { service: 'Reddit', category: 'Social', urls: [
    'https://www.redditstatus.com/api/v2/status.json',
    'https://www.redditstatus.com/api/v2/components.json',
  ] },
  { service: 'Telegram', category: 'Social', urls: [
    'https://status.telegram.org/',
    'https://core.telegram.org/',
  ] },
  // --- Media ---
  { service: 'Nuvio', category: 'Media', urls: [
    'https://nuvio.tv/',
    'https://api.nuvio.tv/',
    'https://status.nuvio.tv/',
  ] },
  { service: 'Stremio', category: 'Media', urls: [
    'https://status.stremio.com/',
    'https://www.stremio.com/',
    'https://api.strem.io/api/',
  ] },
  { service: 'TMDB', category: 'Media', urls: [
    'https://status.themoviedb.org/',
    'https://status.themoviedb.org/summary.json',
    'https://status.themoviedb.org/api/v2/status.json',
  ] },
  { service: 'Trakt', category: 'Media', urls: [
    'https://status.trakt.tv/',
    'https://status.trakt.tv/api/v2/status.json',
    'https://status.trakt.tv/index.json',
  ] },
  { service: 'Simkl', category: 'Media', urls: [
    'https://status.simkl.com/',
    'https://status.simkl.com/api/v2/status.json',
    'https://api.simkl.com/',
  ] },
];

const HINTS = [
  'statuspage.io', 'statuspage', 'instatus', 'atlassian', 'statuspal', 'status.io',
  'api/v2', 'summary.json', 'history.rss', 'incidents.json', 'components.json',
  '__NEXT_DATA__', 'graphql', 'cdn.statuspage.io',
];

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function saveRaw(slug, url, text, ext) {
  const name = `${slug}__${slugify(new URL(url).pathname || 'root') || 'root'}.${ext}`;
  const target = path.join(RAW_DIR, name);
  const body = ext === 'json' ? JSON.stringify(JSON.parse(text), null, 2) : text.slice(0, 400_000);
  await writeFile(target, body, 'utf8');
  return path.relative(ROOT, target).replaceAll('\\', '/');
}

async function fetchCandidate(service, category, url) {
  const started = performance.now();
  const result = {
    service, category, url, ok: false, status: 0, contentType: '',
    bytes: 0, ms: 0, finalUrl: url, jsonKeys: null, jsonShape: null,
    hints: [], error: null, rawSaved: null,
  };
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': UA, accept: '*/*' },
    });
    const text = await res.text();
    result.status = res.status;
    result.ok = res.ok;
    result.contentType = res.headers.get('content-type') ?? '';
    result.bytes = text.length;
    result.finalUrl = res.url;
    result.ms = Math.round(performance.now() - started);

    const looksJson = /json/i.test(result.contentType) || /^\s*[[{]/.test(text);
    if (looksJson) {
      try {
        const parsed = JSON.parse(text);
        result.jsonShape = Array.isArray(parsed) ? `array(${parsed.length})` : 'object';
        result.jsonKeys = Array.isArray(parsed) ? Object.keys(parsed[0] ?? {}) : Object.keys(parsed);
        result.rawSaved = await saveRaw(slugify(service), url, text, 'json');
      } catch {
        result.jsonShape = 'unparsed';
      }
    } else {
      const lower = text.toLowerCase();
      result.hints = HINTS.filter((h) => lower.includes(h.toLowerCase()));
      if (result.ok) result.rawSaved = await saveRaw(slugify(service), url, text, 'html');
    }
  } catch (err) {
    result.ms = Math.round(performance.now() - started);
    result.error = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message ?? 'error');
  }
  return result;
}

async function runPool(items, worker, limit) {
  const results = [];
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      results.push(await worker(current));
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  const jobs = CANDIDATES.flatMap((c) => c.urls.map((url) => ({ service: c.service, category: c.category, url })));
  const results = await runPool(jobs, (j) => fetchCandidate(j.service, j.category, j.url), CONCURRENCY);
  results.sort((a, b) => a.service.localeCompare(b.service) || a.url.localeCompare(b.url));

  const report = { generatedAt: new Date().toISOString(), checkedUrls: results.length, results };
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  let current = '';
  for (const r of results) {
    if (r.service !== current) {
      current = r.service;
      console.log(`\n== ${r.service} [${r.category}]`);
    }
    const status = r.ok ? String(r.status) : (r.error ?? String(r.status));
    const shape = r.jsonShape ? ` json=${r.jsonShape}${r.jsonKeys ? ` keys=[${r.jsonKeys.slice(0, 8).join(',')}]` : ''}` : '';
    const hints = r.hints.length ? ` hints=[${r.hints.join(',')}]` : '';
    console.log(`  ${status.padEnd(9)} ${String(r.contentType).split(';')[0].padEnd(22)} ${String(r.bytes).padStart(7)}B ${String(r.ms).padStart(6)}ms  ${r.url}${shape}${hints}`);
  }
  console.log(`\nreport -> ${path.relative(ROOT, REPORT_PATH)}`);
}

await main();
