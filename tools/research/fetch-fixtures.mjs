/**
 * Downloads real vendor responses into packages/connectors/test/fixtures so the
 * connector parsers can be tested against genuine payloads (including the UTF-16 AWS feed).
 *
 * Usage: node tools/research/fetch-fixtures.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const FIXTURES = path.join(ROOT, 'packages', 'connectors', 'test', 'fixtures');
const UA = 'TechPulseResearch/0.1 (+status-aggregator-research)';

const TARGETS = [
  { file: 'statuspage-github-status.json', url: 'https://www.githubstatus.com/api/v2/status.json', binary: false },
  { file: 'statuspage-github-components.json', url: 'https://www.githubstatus.com/api/v2/components.json', binary: false },
  { file: 'statuspage-github-incidents.json', url: 'https://www.githubstatus.com/api/v2/incidents.json', binary: false },
  { file: 'statuspage-epicgames-components.json', url: 'https://status.epicgames.com/api/v2/components.json', binary: false },
  { file: 'statusio-roblox-status.json', url: 'https://api.status.io/1.0/status/59db90dbcdeb2f04dadcf16d', binary: false },
  { file: 'betterstack-huggingface-index.json', url: 'https://status.huggingface.co/index.json', binary: false },
  { file: 'google-cloud-incidents.json', url: 'https://status.cloud.google.com/incidents.json', binary: false },
  { file: 'aws-health-currentevents.json', url: 'https://health.aws.amazon.com/public/currentevents', binary: true },
  { file: 'xbox-servicestatusv6.xml', url: 'https://xnotify.xboxlive.com/servicestatusv6/US/en-US', binary: false },
  { file: 'xbox-servicestatusv4.xml', url: 'https://xnotify.xboxlive.com/servicestatusv4/US/en-US', binary: false },
  { file: 'nuvio-status.json', url: 'https://status.nuvio.tv/api/status', binary: false },
  { file: 'trakt-monitors.json', url: 'https://status.trakt.tv/api/getMonitorList/wVLWNFLGN9', binary: false },
  { file: 'trakt-events.json', url: 'https://status.trakt.tv/api/getEventFeed/wVLWNFLGN9', binary: false },
  { file: 'simkl-monitors.json', url: 'https://status.simkl.com/api/getMonitorList/Nx8xTN71j', binary: false },
  { file: 'deepseek-feed.rss', url: 'https://status.deepseek.com/feed.rss', binary: false },
  { file: 'tmdb-feed.rss', url: 'https://status.themoviedb.org/rss', binary: false },
  { file: 'azure-feed.rss', url: 'https://azure.status.microsoft/en-us/status/feed/', binary: false },
  { file: 'steam-serverinfo.json', url: 'https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/', binary: false },
];

async function main() {
  await mkdir(FIXTURES, { recursive: true });
  for (const target of TARGETS) {
    try {
      const response = await fetch(target.url, {
        signal: AbortSignal.timeout(20_000),
        headers: { 'user-agent': UA, accept: '*/*' },
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      const payload = target.binary ? buffer : pretty(buffer.toString('utf8'));
      await writeFile(path.join(FIXTURES, target.file), payload);
      console.log(`${String(response.status).padEnd(5)} ${String(buffer.byteLength).padStart(8)}B  ${target.file}`);
    } catch (error) {
      console.log(`FAIL  ${target.file}  ${error?.message ?? error}`);
    }
  }
}

function pretty(text) {
  if (/^\s*[[{]/.test(text)) {
    try {
      return `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
    } catch {
      return text;
    }
  }
  return text;
}

await main();
