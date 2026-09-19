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
  category: string;
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
  description: string;
  status: UnifiedStatus;
  counts: Record<UnifiedStatus, number>;
  services: ServiceCard[];
};

export type Overview = {
  status: UnifiedStatus;
  counts: Record<UnifiedStatus, number>;
  services: number;
  lastUpdate: string | null;
  categories: { slug: string; name: string; description: string; status: UnifiedStatus; counts: Record<UnifiedStatus, number>; services: number }[];
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { accept: 'application/json' }, ...init });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 180)}` : ''}`);
  }
  return (await response.json()) as T;
}

export const api = {
  overview: () => request<Overview>('/api/overview'),
  categories: () => request<CategorySnapshot[]>('/api/categories'),
  services: (params: { category?: string; q?: string; status?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.category) search.set('category', params.category);
    if (params.q) search.set('q', params.q);
    if (params.status) search.set('status', params.status);
    const suffix = search.toString();
    return request<ServiceCard[]>(`/api/services${suffix ? `?${suffix}` : ''}`);
  },
  service: (slug: string, hours = 24) => request<ServiceDetail>(`/api/services/${encodeURIComponent(slug)}?hours=${hours}`),
  incidents: (limit = 50) => request<{ count: number; incidents: (IncidentRecord & { serviceSlug: string; serviceName: string })[] }>(`/api/incidents?limit=${limit}`),
  events: (limit = 50) => request<{ service_slug: string; message: string; created_at: string; from_status: string | null; to_status: string | null }[]>(`/api/events?limit=${limit}`),
  search: (q: string) => request<{ query: string; results: { slug: string; name: string; category: string; matchedOn: string; detail: string | null }[] }>(`/api/search?q=${encodeURIComponent(q)}`),
  health: () => request<{ ok: boolean; database: Record<string, number>; catalog: { services: number } }>('/api/health'),
};
