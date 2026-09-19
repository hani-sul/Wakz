import type { DatabaseSync } from 'node:sqlite';
import {
  SERVICE_BY_SLUG,
  worstStatus,
} from '../../../packages/core/src/index.ts';
import type {
  CategoryDefinition,
  CategorySnapshot,
  ServiceDefinition,
  ServiceSnapshot,
  UnifiedStatus,
} from '../../../packages/core/src/index.ts';
import {
  getComponents,
  getConnectivityMap,
  getIncidents,
  getLatencyHistory,
  getServiceRow,
  getStatusHistory,
  getStatusMap,
  listCategories,
  listServiceRows,
} from '../../../packages/db/src/index.ts';

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function buildServiceSnapshot(db: DatabaseSync, slug: string, historyHours = 24, latencyKind = 'https'): ServiceSnapshot | null {
  const definition = SERVICE_BY_SLUG.get(slug);
  if (!definition) return null;

  const status = getStatusMap(db).get(slug);
  const connectivity = getConnectivityMap(db).get(slug);
  const latency = parseJson<Record<string, number | null>>(connectivity?.latency ?? '{}', {});
  const incidents = getIncidents(db, slug, 'incident', 25);
  const maintenances = getIncidents(db, slug, 'maintenance', 25);
  const history = getStatusHistory(db, slug, historyHours);
  const latencySeries = getLatencyHistory(db, slug, latencyKind as never, historyHours);

  const historyWithLatency = history.map((point) => {
    const match = latencySeries.find((series) => series.checkedAt === point.checkedAt);
    return { checkedAt: point.checkedAt, status: point.status, latencyMs: match?.latencyMs ?? null };
  });

  return {
    service: definition,
    officialStatus: (status?.status ?? 'UNKNOWN') as UnifiedStatus,
    officialStatusRaw: status?.status_raw ?? null,
    officialSourceKind: (status?.source_kind ?? definition.sourceKind) as ServiceSnapshot['officialSourceKind'],
    officialSourceUrl: status?.source_url ?? definition.statusPage,
    officialCheckedAt: status?.checked_at ?? null,
    officialConfidence: (status?.confidence ?? definition.confidence) as ServiceSnapshot['officialConfidence'],
    officialErrorMessage: status?.error ?? null,
    connectivityStatus: (connectivity?.status ?? 'UNKNOWN') as UnifiedStatus,
    connectivityCheckedAt: connectivity?.checked_at ?? null,
    components: getComponents(db, slug),
    incidents,
    maintenances,
    latency: {
      http: latency.http ?? null,
      https: latency.https ?? null,
      dns: latency.dns ?? null,
      tcp: latency.tcp ?? null,
      icmp: latency.icmp ?? null,
    },
    history: historyWithLatency,
    limitation: definition.limitation,
  };
}

export function buildAllSnapshots(db: DatabaseSync, options: { category?: string; status?: string; query?: string } = {}): ServiceSnapshot[] {
  const rows = listServiceRows(db, options.category);
  const snapshots: ServiceSnapshot[] = [];
  for (const row of rows) {
    const snapshot = buildServiceSnapshot(db, row.slug);
    if (snapshot) snapshots.push(snapshot);
  }
  const query = options.query?.toLowerCase().trim();
  const filtered = snapshots.filter((snapshot) => {
    if (options.status) {
      const statuses = [snapshot.officialStatus, snapshot.connectivityStatus];
      if (!statuses.includes(options.status as UnifiedStatus)) return false;
    }
    if (!query) return true;
    return (
      snapshot.service.name.toLowerCase().includes(query) ||
      snapshot.service.slug.includes(query) ||
      snapshot.components.some((component) => component.name.toLowerCase().includes(query))
    );
  });
  return filtered.sort((a, b) => a.service.name.localeCompare(b.service.name));
}

export function buildCategorySnapshots(db: DatabaseSync, options: { category?: string } = {}): CategorySnapshot[] {
  const categories = listCategories(db) as CategoryDefinition[];
  const snapshots = buildAllSnapshots(db, {});
  const byCategory = new Map<string, ServiceSnapshot[]>();
  for (const snapshot of snapshots) {
    const list = byCategory.get(snapshot.service.category) ?? [];
    list.push(snapshot);
    byCategory.set(snapshot.service.category, list);
  }

  return categories
    .filter((category) => !options.category || category.slug === options.category)
    .map((category) => {
      const services = byCategory.get(category.slug) ?? [];
      const counts: Record<UnifiedStatus, number> = {
        OPERATIONAL: 0,
        DEGRADED: 0,
        PARTIAL_OUTAGE: 0,
        MAJOR_OUTAGE: 0,
        MAINTENANCE: 0,
        UNKNOWN: 0,
      };
      for (const service of services) {
        const effective = effectiveStatus(service);
        counts[effective] = (counts[effective] ?? 0) + 1;
      }
      const status = worstStatus(services.map((service) => effectiveStatus(service)));
      return { category, status, counts, services };
    });
}

/**
 * The status a user should see for a card: the official status when the vendor publishes one,
 * otherwise our own connectivity verdict. Both are always returned separately too.
 */
export function effectiveStatus(snapshot: ServiceSnapshot): UnifiedStatus {
  if (snapshot.officialStatus !== 'UNKNOWN') return snapshot.officialStatus;
  return snapshot.connectivityStatus;
}

export function overallSummary(db: DatabaseSync): {
  status: UnifiedStatus;
  counts: Record<UnifiedStatus, number>;
  services: number;
  lastUpdate: string | null;
} {
  const snapshots = buildAllSnapshots(db, {});
  const counts: Record<UnifiedStatus, number> = {
    OPERATIONAL: 0,
    DEGRADED: 0,
    PARTIAL_OUTAGE: 0,
    MAJOR_OUTAGE: 0,
    MAINTENANCE: 0,
    UNKNOWN: 0,
  };
  let lastUpdate: string | null = null;
  for (const snapshot of snapshots) {
    counts[effectiveStatus(snapshot)] += 1;
    const timestamps = [snapshot.officialCheckedAt, snapshot.connectivityCheckedAt].filter((value): value is string => Boolean(value));
    for (const timestamp of timestamps) {
      if (!lastUpdate || Date.parse(timestamp) > Date.parse(lastUpdate)) lastUpdate = timestamp;
    }
  }
  return {
    status: worstStatus(snapshots.map((snapshot) => effectiveStatus(snapshot))),
    counts,
    services: snapshots.length,
    lastUpdate,
  };
}

export function serviceRowToDefinition(db: DatabaseSync, slug: string): ServiceDefinition | null {
  const row = getServiceRow(db, slug);
  if (!row) return null;
  return SERVICE_BY_SLUG.get(slug) ?? null;
}
