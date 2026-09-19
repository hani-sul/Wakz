import { localNetworkInfo } from './native.ts';

export type DiscoveryResult = { address: string; latencyMs: number; via: 'same-origin' | 'gateway' | 'scan' };

export type DiscoveryProgress = { done: number; total: number; found: DiscoveryResult | null };

/** Port used by the optional Wakz server (same default as the collector and the API). */
const SERVER_PORT = 4310;
const PROBE_TIMEOUT_MS = 700;
const CONCURRENCY = 32;
const MAX_HOSTS = 512;

function lastOctet(ip: string): number {
  const parts = ip.split('.');
  return Number(parts[3] ?? 0);
}

function networkPrefix(ip: string): string {
  const parts = ip.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

async function looksLikeWakzServer(address: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  try {
    const response = await fetch(`http://${address}:${SERVER_PORT}/api/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: boolean; catalog?: { services?: number } };
    return body?.ok === true && typeof body.catalog?.services === 'number';
  } catch {
    return false;
  }
}

/**
 * Finds a Wakz server without typing an address:
 *  1. when the app itself is served over http(s), that origin is used;
 *  2. otherwise the device's own network (interfaces + default gateway, provided by the Android
 *     bridge) is scanned for port 4310 and validated against the Wakz health endpoint.
 * The local engine keeps working regardless of the result.
 */
export async function discoverServer(onProgress?: (progress: DiscoveryProgress) => void): Promise<DiscoveryResult | null> {
  // 1) Same-origin (hosted copy of the dashboard).
  if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) {
    try {
      const response = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        const body = (await response.json()) as { ok?: boolean; catalog?: { services?: number } };
        if (body?.ok === true && typeof body.catalog?.services === 'number') {
          const address = `${location.hostname}:${location.port || (location.protocol === 'https:' ? '443' : '80')}`;
          const result: DiscoveryResult = { address, latencyMs: 0, via: 'same-origin' };
          onProgress?.({ done: 1, total: 1, found: result });
          return result;
        }
      }
    } catch {
      // Fall through to the local network scan.
    }
  }

  // 2) Local network scan through the Android bridge.
  const info = localNetworkInfo();
  if (!info || info.interfaces.length === 0) return null;

  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (address: string): void => {
    if (seen.has(address)) return;
    seen.add(address);
    candidates.push(address);
  };

  if (info.gateway && info.gateway.startsWith('192.168.') || (info.gateway ?? '').startsWith('10.')) push(info.gateway as string);

  for (const networkInterface of info.interfaces) {
    const prefix = networkPrefix(networkInterface.ip);
    const own = lastOctet(networkInterface.ip);
    // /24 style sweep of the device's own subnet, gateway first.
    for (let host = 1; host <= 254; host += 1) {
      if (host === own) continue;
      if (host === 1) continue; // already queued as the gateway when available
      push(`${prefix}.${host}`);
      if (candidates.length >= MAX_HOSTS) break;
    }
    if (candidates.length >= MAX_HOSTS) break;
  }
  if (candidates.length === 0) return null;

  const started = performance.now();
  let done = 0;
  let found: DiscoveryResult | null = null;
  let cursor = 0;

  const workers = Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, async () => {
    while (cursor < candidates.length && !found) {
      const address = candidates[cursor++];
      if (!address) break;
      const ok = await looksLikeWakzServer(address);
      done += 1;
      if (ok && !found) {
        found = {
          address: `${address}:${SERVER_PORT}`,
          latencyMs: Math.round(performance.now() - started),
          via: info.gateway === address ? 'gateway' : 'scan',
        };
      }
      if (done % 16 === 0 || found) onProgress?.({ done, total: candidates.length, found });
    }
  });

  await Promise.all(workers);
  onProgress?.({ done, total: candidates.length, found });
  return found;
}
