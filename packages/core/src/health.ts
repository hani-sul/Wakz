import type { CheckKind, CheckResult, UnifiedStatus } from './types.ts';

export type HealthThresholds = {
  degradedAfterFailures: number;
  downAfterFailures: number;
  majorOutageLatencyMs: number;
  degradedLatencyMs: number;
  checkTimeoutMs?: number;
};

export type HealthAssessment = {
  status: UnifiedStatus;
  consecutiveFailures: number;
  successRate: number;
  checksRun: number;
  reasons: string[];
};

/**
 * Health engine: a single failed request is never an outage.
 *
 *  - 1 failure                     -> warning (reason recorded, status stays as before)
 *  - `degradedAfterFailures`       -> DEGRADED
 *  - `downAfterFailures` failures  -> MAJOR_OUTAGE
 *  - high latency on healthy probes-> DEGRADED
 */
export function assessHealth(
  checks: CheckResult[],
  thresholds: HealthThresholds,
  previousStatus: UnifiedStatus = 'UNKNOWN',
  context: { officialStatus?: UnifiedStatus | null } = {},
): HealthAssessment {
  const reasons: string[] = [];
  const relevant = checks.filter((check) => check.kind !== 'icmp' || check.error !== 'icmp-unavailable');
  if (relevant.length === 0) {
    return {
      status: 'UNKNOWN',
      consecutiveFailures: 0,
      successRate: 0,
      checksRun: 0,
      reasons: ['no checks executed'],
    };
  }

  const ordered = [...relevant].sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt));
  let consecutiveFailures = 0;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    if (ordered[index]?.ok) break;
    consecutiveFailures += 1;
  }

  const successes = relevant.filter((check) => check.ok).length;
  const successRate = successes / relevant.length;

  const primaryKinds: CheckKind[] = ['https', 'http', 'tcp', 'dns'];
  const primary = relevant.filter((check) => primaryKinds.includes(check.kind));
  const primarySuccess = primary.filter((check) => check.ok).length;
  const primaryFailures = primary.length - primarySuccess;
  const latencySource = primary.filter((check) => check.ok && check.latencyMs !== null);
  const worstLatency = latencySource.reduce((max, check) => Math.max(max, check.latencyMs ?? 0), 0);

  /**
   * When the vendor's official source reports normal operation and every one of our checks
   * answered, our own verdict stays "operational" as well: latency alone (which depends on the
   * user's network and region) must not contradict a healthy official status.
   * Degraded, maintenance and unknown official states keep the measured behaviour.
   */
  const officialHealthy = context.officialStatus === 'OPERATIONAL';
  if (officialHealthy && primary.length > 0 && primaryFailures === 0) {
    reasons.push('official status is operational and all checks answered');
    return { status: 'OPERATIONAL', consecutiveFailures, successRate, checksRun: relevant.length, reasons };
  }

  if (primary.length > 0 && primaryFailures === primary.length && primaryFailures >= thresholds.downAfterFailures) {
    reasons.push(`${primaryFailures} consecutive failures across HTTP/HTTPS/TCP/DNS`);
    return { status: 'MAJOR_OUTAGE', consecutiveFailures, successRate, checksRun: relevant.length, reasons };
  }

  if (primary.length > 0 && primarySuccess === 0 && primaryFailures >= thresholds.degradedAfterFailures) {
    reasons.push(`${primaryFailures} consecutive failures across HTTP/HTTPS/TCP/DNS`);
    return { status: 'DEGRADED', consecutiveFailures, successRate, checksRun: relevant.length, reasons };
  }

  if (primary.length > 0 && primarySuccess === 0 && primaryFailures === 1) {
    reasons.push('single failed check — treated as a warning, not an outage');
    return {
      status: previousStatus === 'UNKNOWN' ? 'UNKNOWN' : previousStatus,
      consecutiveFailures,
      successRate,
      checksRun: relevant.length,
      reasons,
    };
  }

  if (worstLatency >= thresholds.majorOutageLatencyMs && primaryFailures === 0) {
    reasons.push(`latency ${worstLatency} ms above ${thresholds.majorOutageLatencyMs} ms`);
    return { status: 'DEGRADED', consecutiveFailures, successRate, checksRun: relevant.length, reasons };
  }

  if (worstLatency >= thresholds.degradedLatencyMs) {
    reasons.push(`latency ${worstLatency} ms above ${thresholds.degradedLatencyMs} ms`);
    return { status: 'DEGRADED', consecutiveFailures, successRate, checksRun: relevant.length, reasons };
  }

  if (primaryFailures > 0) {
    reasons.push(
      primaryFailures === 1
        ? `single failed check out of ${primary.length} - treated as a warning, not an outage`
        : `${primaryFailures} failing checks out of ${primary.length}`,
    );
  }

  return { status: 'OPERATIONAL', consecutiveFailures, successRate, checksRun: relevant.length, reasons };
}

export function latencySummary(checks: CheckResult[]): Record<CheckKind, number | null> {
  const summary: Record<CheckKind, number | null> = { http: null, https: null, dns: null, tcp: null, icmp: null };
  for (const check of checks) {
    if (!check.ok || check.latencyMs === null) continue;
    const current = summary[check.kind];
    summary[check.kind] = current === null ? check.latencyMs : Math.round((current + check.latencyMs) / 2);
  }
  return summary;
}

export function availabilityFromHistory(samples: { status: UnifiedStatus }[]): number {
  if (samples.length === 0) return 0;
  const healthy = samples.filter((sample) => sample.status === 'OPERATIONAL').length;
  return Math.round((healthy / samples.length) * 1000) / 10;
}
