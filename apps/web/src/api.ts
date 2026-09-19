import { apiUrl, updateDataSource } from './lib/appConfig.ts';

export type UnifiedStatus =
  | 'OPERATIONAL'
  | 'DEGRADED'
  | 'PARTIAL_OUTAGE'
  | 'MAJOR_OUTAGE'
  | 'MAINTENANCE'
  | 'UNKNOWN';

export type ServiceCard = {
  slug: string;
  name: string;
  nameAr?: string;
  category: string;
  categoryNameAr: string;
  homepage: string;
  statusPage: string | null;
  status: UnifiedStatus;
  officialStatus: UnifiedStatus;
  officialStatusRaw: string | null;
  officialSourceKind: string;
  officialSourceUrl: string | null;
  officialCheckedAt: string | null;
  officialConfidence: 'high' | 'medium' | 'low';
  officialErrorMessage: string | null;
  connectivityStatus: UnifiedStatus;
  connectivityCheckedAt: string | null;
  latency: { http: number | null; https: number | null; dns: number | null; tcp: number | null; icmp: number | null };
  activeIncidents: number;
  componentCount: number;
  componentSummary: Record<string, number>;
  limitation: string | null;
  limitationAr: string | null;
  comingSoon?: boolean;
};

export type ComponentState = {
  externalId: string;
  name: string;
  group: string | null;
  status: UnifiedStatus;
  statusRaw: string;
  position: number;
};

export type IncidentRecord = {
  externalId: string;
  kind: 'incident' | 'maintenance';
  title: string;
  status: string;
  statusRaw: string;
  impact: UnifiedStatus;
  startedAt: string | null;
  updatedAt: string | null;
  resolvedAt: string | null;
  endsAt?: string | null;
  description: string | null;
  url: string | null;
  components: string[];
};

export type ServiceDetail = ServiceCard & {
  components: ComponentState[];
  incidents: IncidentRecord[];
  maintenances: IncidentRecord[];
  history: { checkedAt: string; status: UnifiedStatus; latencyMs: number | null }[];
  officialStatusDescription: string | null;
  recentRuns: { started_at: string; ok: number; duration_ms: number | null; error: string | null }[];
};

export type CategorySnapshot = {
  slug: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  status: UnifiedStatus;
  counts: Record<UnifiedStatus, number>;
  services: ServiceCard[];
};

export type Overview = {
  status: UnifiedStatus;
  counts: Record<UnifiedStatus, number>;
  services: number;
  lastUpdate: string | null;
  categories: {
    slug: string;
    name: string;
    nameAr: string;
    description: string;
    descriptionAr: string;
    status: UnifiedStatus;
    counts: Record<UnifiedStatus, number>;
    services: number;
  }[];
};

export type SnapshotFile = {
  generatedAt: string;
  overview: Overview;
  categories: CategorySnapshot[];
  services: Record<string, ServiceDetail>;
  events: { service_slug: string; message: string; created_at: string; from_status: string | null; to_status: string | null }[];
};

async function request<T>(path: string, fallback: (snapshot: SnapshotFile) => T | null): Promise<T> {
  try {
    const response = await fetch(apiUrl(path), { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const data = (await response.json()) as T;
    updateDataSource({ source: 'live', error: null });
    return data;
  } catch (error) {
    const snapshot = await loadSnapshot();
    const fallbackValue = snapshot ? fallback(snapshot) : null;
    if (fallbackValue !== null && fallbackValue !== undefined) {
      updateDataSource({
        source: 'snapshot',
        error: error instanceof Error ? error.message : String(error),
        snapshotGeneratedAt: snapshot?.generatedAt ?? null,
      });
      return fallbackValue;
    }
    updateDataSource({ source: 'none', error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

let snapshotPromise: Promise<SnapshotFile | null> | null = null;

export function loadSnapshot(): Promise<SnapshotFile | null> {
  if (!snapshotPromise) {
    snapshotPromise = (async () => {
      try {
        const url = new URL('snapshot.json', window.location.href).toString();
        const response = await fetch(url, { headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as SnapshotFile;
      } catch {
        return null;
      }
    })();
  }
  return snapshotPromise;
}

export function resetSnapshotCache(): void {
  snapshotPromise = null;
}

async function liveRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), { headers: { accept: 'application/json' }, ...init });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 180)}` : ''}`);
  }
  return (await response.json()) as T;
}

export const api = {
  overview: () => request<Overview>('/api/overview', (snapshot) => snapshot.overview),
  categories: () => request<CategorySnapshot[]>('/api/categories', (snapshot) => snapshot.categories),
  services: (params: { category?: string; q?: string; status?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.category) search.set('category', params.category);
    if (params.q) search.set('q', params.q);
    if (params.status) search.set('status', params.status);
    const suffix = search.toString();
    return request<ServiceCard[]>(`/api/services${suffix ? `?${suffix}` : ''}`, (snapshot) =>
      Object.values(snapshot.services)
        .map((detail) => detail as unknown as ServiceCard)
        .filter((service) => (!params.category || service.category === params.category))
        .filter((service) => {
          if (!params.status) return true;
          return service.officialStatus === params.status || service.connectivityStatus === params.status || service.status === params.status;
        })
        .filter((service) => {
          const needle = params.q?.toLowerCase().trim();
          if (!needle) return true;
          return service.name.toLowerCase().includes(needle) || service.slug.includes(needle);
        }));
  },
  service: (slug: string, hours = 24) =>
    request<ServiceDetail>(`/api/services/${encodeURIComponent(slug)}?hours=${hours}`, (snapshot) => snapshot.services[slug] ?? null),
  incidents: (limit = 50) =>
    request<{ count: number; incidents: (IncidentRecord & { serviceSlug: string; serviceName: string })[] }>('/api/incidents?limit=' + limit, (snapshot) => {
      const incidents = Object.values(snapshot.services).flatMap((service) =>
        service.incidents
          .filter((incident) => incident.resolvedAt === null)
          .map((incident) => ({ ...incident, serviceSlug: service.slug, serviceName: service.name })));
      return { count: incidents.length, incidents: incidents.slice(0, limit) };
    }),
  events: (limit = 50) =>
    request<{ service_slug: string; message: string; created_at: string; from_status: string | null; to_status: string | null }[]>(
      `/api/events?limit=${limit}`,
      (snapshot) => snapshot.events.slice(0, limit),
    ),
  search: (q: string) =>
    request<{ query: string; results: { slug: string; name: string; category: string; matchedOn: string; detail: string | null }[] }>(
      `/api/search?q=${encodeURIComponent(q)}`,
      (snapshot) => {
        const needle = q.toLowerCase().trim();
        const results: { slug: string; name: string; category: string; matchedOn: string; detail: string | null }[] = [];
        for (const service of Object.values(snapshot.services)) {
          if (service.name.toLowerCase().includes(needle) || service.slug.includes(needle)) {
            results.push({ slug: service.slug, name: service.name, category: service.category, matchedOn: 'service', detail: null });
          }
          for (const component of service.components) {
            if (component.name.toLowerCase().includes(needle)) {
              results.push({ slug: service.slug, name: service.name, category: service.category, matchedOn: 'component', detail: component.name });
            }
          }
        }
        for (const category of snapshot.categories) {
          if (category.name.toLowerCase().includes(needle) || category.nameAr.includes(q.trim())) {
            results.push({ slug: `category:${category.slug}`, name: category.name, category: category.slug, matchedOn: 'category', detail: null });
          }
        }
        return { query: q, results: results.slice(0, 20) };
      }),
  health: () =>
    request<{ ok: boolean; database: Record<string, number>; catalog: { services: number } }>('/api/health', (snapshot) => ({
      ok: true,
      database: { services: Object.keys(snapshot.services).length },
      catalog: { services: Object.keys(snapshot.services).length },
    })),
  liveRequest,
};
