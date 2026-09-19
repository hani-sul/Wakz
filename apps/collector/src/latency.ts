import { connect } from 'node:net';
import { lookup, resolve4, resolve6 } from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fetchResource } from '../../../packages/core/src/index.ts';
import type { CheckKind, CheckResult, CheckTarget, ServiceDefinition } from '../../../packages/core/src/index.ts';

export type LatencyOptions = {
  region: string;
  timeoutMs: number;
  icmpEnabled: boolean;
};

function result(
  target: CheckTarget,
  kind: CheckKind,
  region: string,
  ok: boolean,
  latencyMs: number | null,
  extra: Partial<CheckResult> = {},
): CheckResult {
  return {
    kind,
    target: target.label ?? target.target,
    ok,
    latencyMs,
    statusCode: extra.statusCode ?? null,
    error: extra.error ?? null,
    region,
    checkedAt: new Date().toISOString(),
    detail: extra.detail ?? null,
  };
}

async function httpCheck(target: CheckTarget, kind: CheckKind, options: LatencyOptions): Promise<CheckResult> {
  const response = await fetchResource(target.target, { timeoutMs: options.timeoutMs, retries: 0 });
  const expected = target.expectStatus ?? [200, 204, 301, 302, 307, 308, 400, 401, 403, 404, 405, 412, 429];
  const ok = response.status > 0 && expected.includes(response.status);
  return result(target, kind, options.region, ok, ok ? response.ms : response.status > 0 ? response.ms : null, {
    statusCode: response.status || null,
    error: ok ? null : (response.error ?? `unexpected status ${response.status}`),
    detail: `HTTP ${response.status} in ${response.ms} ms`,
  });
}

async function dnsCheck(target: CheckTarget, options: LatencyOptions): Promise<CheckResult> {
  const started = performance.now();
  try {
    let addresses: string[] = [];
    try {
      addresses = await resolve4(target.target);
    } catch {
      addresses = await resolve6(target.target);
    }
    const elapsed = Math.round(performance.now() - started);
    return result(target, 'dns', options.region, addresses.length > 0, elapsed, {
      detail: `${addresses.length} address(es), e.g. ${addresses[0] ?? 'n/a'}`,
    });
  } catch (error) {
    return result(target, 'dns', options.region, false, null, {
      error: (error as { code?: string }).code ?? String(error),
    });
  }
}

async function tcpCheck(target: CheckTarget, options: LatencyOptions): Promise<CheckResult> {
  const port = target.port ?? 443;
  const started = performance.now();
  return new Promise<CheckResult>((resolve) => {
    const socket = connect({ host: target.target, port });
    const finish = (ok: boolean, error?: string): void => {
      const elapsed = Math.round(performance.now() - started);
      socket.destroy();
      resolve(result(target, 'tcp', options.region, ok, ok ? elapsed : null, {
        error: error ?? null,
        detail: `tcp ${target.target}:${port}`,
      }));
    };
    socket.setTimeout(options.timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false, 'timeout'));
    socket.once('error', (error) => finish(false, (error as { code?: string }).code ?? error.message));
  });
}

async function resolvable(host: string): Promise<boolean> {
  try {
    await lookup(host);
    return true;
  } catch {
    return false;
  }
}

async function icmpCheck(target: CheckTarget, options: LatencyOptions): Promise<CheckResult | null> {
  if (!options.icmpEnabled) return null;
  if (!(await resolvable(target.target))) return null;

  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'ping.exe' : 'ping';
  const args = isWindows
    ? ['-n', '1', '-w', String(options.timeoutMs), target.target]
    : ['-c', '1', '-W', String(Math.max(1, Math.round(options.timeoutMs / 1000))), target.target];

  return new Promise<CheckResult | null>((resolve) => {
    execFile(command, args, { timeout: options.timeoutMs + 1500 }, (error, stdout) => {
      const text = String(stdout);
      const match = isWindows
        ? /time[=<]\s*(\d+)\s*ms/i.exec(text)
        : /time[=](\d+(?:\.\d+)?)\s*ms/i.exec(text);
      if (error || !match) {
        resolve(result(target, 'icmp', options.region, false, null, {
          error: error ? 'icmp failed' : 'icmp-unavailable',
          detail: 'ICMP may be blocked by the network or the target - this is not treated as an outage.',
        }));
        return;
      }
      resolve(result(target, 'icmp', options.region, true, Math.round(Number(match[1])), {
        detail: `icmp echo reply in ${match[1]} ms`,
      }));
    });
  });
}

export async function runChecks(service: ServiceDefinition, options: LatencyOptions): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  for (const target of service.checkTargets) {
    switch (target.kind) {
      case 'https':
      case 'http': {
        checks.push(await httpCheck(target, target.kind, options));
        break;
      }
      case 'dns': {
        checks.push(await dnsCheck(target, options));
        break;
      }
      case 'tcp': {
        checks.push(await tcpCheck(target, options));
        break;
      }
      case 'icmp': {
        const check = await icmpCheck(target, options);
        if (check) checks.push(check);
        break;
      }
      default:
        break;
    }
  }
  return checks;
}
