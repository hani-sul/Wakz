import type { Connector, ConnectorContext, ConnectorResult, ServiceDefinition, UnifiedStatus } from '../../core/src/index.ts';

export type { Connector, ConnectorCapabilities, ConnectorContext } from '../../core/src/index.ts';

export function baseResult(
  service: ServiceDefinition,
  now: Date,
  overrides: Partial<ConnectorResult> = {},
): ConnectorResult {
  return {
    ok: true,
    status: 'UNKNOWN',
    statusRaw: null,
    sourceKind: service.sourceKind,
    sourceUrl: service.statusPage,
    official: service.official,
    confidence: service.confidence,
    checkedAt: now.toISOString(),
    components: [],
    incidents: [],
    regions: [],
    metadata: {},
    notes: [],
    error: null,
    ...overrides,
  };
}

export function failureResult(service: ServiceDefinition, now: Date, message: string, sourceUrl?: string | null): ConnectorResult {
  return baseResult(service, now, {
    ok: false,
    status: 'UNKNOWN',
    statusRaw: null,
    error: message,
    sourceUrl: sourceUrl ?? service.statusPage,
    notes: [`connector failed: ${message}`],
  });
}

export function statusFromNumbers(value: number | null | undefined): UnifiedStatus {
  switch (value) {
    case 0:
      return 'OPERATIONAL';
    case 1:
      return 'MAINTENANCE';
    case 2:
      return 'DEGRADED';
    case 3:
      return 'MAJOR_OUTAGE';
    default:
      return 'UNKNOWN';
  }
}

export function toIso(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}
