/**
 * Bridge to the Android shell.
 *
 * The app exposes `window.WakzNative` (see MainActivity) so a real ICMP ping can be measured with
 * the device's own `ping` binary. When the bridge is not available (plain browser), the ping page
 * falls back to an HTTP round-trip measurement and says so explicitly.
 */

type PingAttempt = { seq: number; ms: number | null };

export type NativePingResult = {
  ok: boolean;
  host: string;
  method: 'icmp' | 'http';
  attempts: PingAttempt[];
  lossPercent: number | null;
  error?: string | null;
};

type NativeBridge = {
  available?: () => boolean;
  startPing?: (host: string, count: number, callbackId: string) => void;
};

declare global {
  interface Window {
    WakzNative?: NativeBridge;
    __wakzPingResult?: (callbackId: string, payload: string) => void;
  }
}

const pending = new Map<string, (payload: NativePingResult) => void>();

if (typeof window !== 'undefined') {
  window.__wakzPingResult = (callbackId: string, payload: string): void => {
    const resolver = pending.get(callbackId);
    if (!resolver) return;
    pending.delete(callbackId);
    try {
      resolver(JSON.parse(payload) as NativePingResult);
    } catch {
      resolver({ ok: false, host: '', method: 'icmp', attempts: [], lossPercent: null, error: 'bad_payload' });
    }
  };
}

export function nativeAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.WakzNative?.startPing);
  } catch {
    return false;
  }
}

/** Real ICMP ping through the Android shell. Resolves with null when the bridge is missing. */
export async function nativePing(host: string, count: number): Promise<NativePingResult | null> {
  if (!nativeAvailable()) return null;
  const bridge = window.WakzNative as NativeBridge;
  const callbackId = `p${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return new Promise<NativePingResult>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(callbackId);
      resolve({ ok: false, host, method: 'icmp', attempts: [], lossPercent: null, error: 'timeout' });
    }, 20_000);
    pending.set(callbackId, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
    try {
      bridge.startPing?.(host, count, callbackId);
    } catch (error) {
      clearTimeout(timer);
      pending.delete(callbackId);
      resolve({ ok: false, host, method: 'icmp', attempts: [], lossPercent: null, error: String(error) });
    }
  });
}

/** Browser fallback: HTTP round-trip latency (clearly labelled, never presented as ICMP). */
export async function httpPing(host: string, count: number, timeoutMs = 4000): Promise<NativePingResult> {
  const attempts: PingAttempt[] = [];
  const target = /^https?:\/\//i.test(host) ? host : `https://${host}/`;
  let failures = 0;
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    try {
      await fetch(target, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
      attempts.push({ seq: index + 1, ms: Math.round(performance.now() - started) });
    } catch {
      failures += 1;
      attempts.push({ seq: index + 1, ms: null });
    }
  }
  return {
    ok: failures < count,
    host,
    method: 'http',
    attempts,
    lossPercent: Math.round((failures / count) * 100),
    error: failures === count ? 'unreachable' : null,
  };
}
