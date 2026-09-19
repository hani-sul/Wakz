import type { Severity, UnifiedStatus } from './types.ts';

const SEVERITY_RANK: Record<UnifiedStatus, number> = {
  OPERATIONAL: 0,
  MAINTENANCE: 1,
  DEGRADED: 2,
  PARTIAL_OUTAGE: 3,
  MAJOR_OUTAGE: 4,
  UNKNOWN: 5,
};

/** Higher rank = worse. UNKNOWN ranks highest because it must never be presented as healthy. */
export function statusRank(status: UnifiedStatus): number {
  return SEVERITY_RANK[status];
}

export function worstStatus(statuses: UnifiedStatus[]): UnifiedStatus {
  if (statuses.length === 0) return 'UNKNOWN';
  return statuses.reduce((worst, current) =>
    statusRank(current) > statusRank(worst) ? current : worst);
}

export function severityOf(status: UnifiedStatus): Severity {
  switch (status) {
    case 'OPERATIONAL':
      return 'ok';
    case 'DEGRADED':
    case 'MAINTENANCE':
      return 'warn';
    case 'PARTIAL_OUTAGE':
    case 'MAJOR_OUTAGE':
      return 'critical';
    default:
      return 'unknown';
  }
}

export function statusLabel(status: UnifiedStatus): string {
  switch (status) {
    case 'OPERATIONAL':
      return 'Operational';
    case 'DEGRADED':
      return 'Degraded';
    case 'PARTIAL_OUTAGE':
      return 'Partial outage';
    case 'MAJOR_OUTAGE':
      return 'Major outage';
    case 'MAINTENANCE':
      return 'Maintenance';
    default:
      return 'Unknown';
  }
}

/**
 * Maps free-text component/incident statuses from any provider onto the unified set.
 * The raw value is always stored next to the mapped one.
 */
export function mapStatusText(raw: string | null | undefined): UnifiedStatus {
  if (!raw) return 'UNKNOWN';
  const value = raw.toLowerCase().replace(/[_-]+/g, ' ').trim();

  // Ordered from the most severe to the least: "Partial Service Outage" must not be
  // swallowed by a generic "service outage" rule.
  if (/(partial outage|partial service outage|partial service disruption|service disruption|partial)/.test(value)) return 'PARTIAL_OUTAGE';
  if (/(major|critical|full outage|complete outage|outage)/.test(value)) return 'MAJOR_OUTAGE';
  if (/(degraded|performance|slow|latency|warning|minor|impact|investigating|identified|monitoring|in progress)/.test(value)) return 'DEGRADED';
  if (/(maintenance|scheduled|updating|update in progress)/.test(value)) return 'MAINTENANCE';
  if (/\b(operational|available|ok|up|none|normal|resolved|healthy|green)\b/.test(value)) return 'OPERATIONAL';
  return 'UNKNOWN';
}

/** Statuspage indicator mapping (indicator + description). */
export function mapStatuspageIndicator(indicator: string | null | undefined, description?: string | null): UnifiedStatus {
  switch ((indicator ?? '').toLowerCase()) {
    case 'none':
      return 'OPERATIONAL';
    case 'minor':
      return 'DEGRADED';
    case 'major':
      return 'PARTIAL_OUTAGE';
    case 'critical':
      return 'MAJOR_OUTAGE';
    case 'maintenance':
      return 'MAINTENANCE';
    default:
      return mapStatusText(description ?? indicator);
  }
}

/** status.io numeric codes. */
export function mapStatusIoCode(code: number | null | undefined, fallback?: string | null): UnifiedStatus {
  switch (code) {
    case 100:
      return 'OPERATIONAL';
    case 200:
      return 'MAINTENANCE';
    case 300:
      return 'DEGRADED';
    case 400:
      return 'PARTIAL_OUTAGE';
    case 500:
      return 'MAJOR_OUTAGE';
    default:
      return mapStatusText(fallback);
  }
}

export function isHealthy(status: UnifiedStatus): boolean {
  return status === 'OPERATIONAL';
}
