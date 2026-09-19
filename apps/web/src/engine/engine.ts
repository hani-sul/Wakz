import { CATEGORIES, SERVICES, compareRegions, worstStatus } from '../../../../packages/core/src/index.ts';
import type { CategoryDefinition, ServiceDefinition, UnifiedStatus } from '../../../../packages/core/src/index.ts';
import type { CategorySnapshot, IncidentRecord, Overview, ServiceCard, ServiceDetail } from '../api.ts';
import { getApiBase } from '../lib/appConfig.ts';
import { collectServiceLocally } from './collect.ts';
import {
  addEvent,
  clearLocalData,
  getAllServiceRecords,
  getMeta,
  getServiceRecord,
  listEvents,
  putMeta,
  putServiceRecord,
} from './store.ts';
import type { LocalIncident, LocalServicePayload, LocalServiceRecord } from './store.ts';

/** Measurements stay fresh for ten minutes; a manual refresh has a 30 second cooldown. */
export const CACHE_TTL_MS = 10 * 60_000;
export const MANUAL_REFRESH_COOLDOWN_MS = 30_000;
const CONCURRENCY = 4;
/** First runs touch ~66 services; small waves keep phones responsive and battery friendly. */
const WAVE_SIZE = 8;
const WAVE_PAUSE_MS = 350;
const HISTORY_LIMIT = 300;

export const SAUDI_TIMEZONES = ['Asia/Riyadh'];

export type EngineState = {
  running: boolean;
  startedAt: number | null;
  lastRun: number | null;
  collected: number;
  total: number;
  lastError: string | null;
  insideSaudiArabia: boolean;
  geoSource: 'auto' | 'manual';
};

const listeners = new Set<(state: EngineState) => void>();
let state: EngineState = {
  running: false,
  startedAt: null,
  lastRun: null,
  collected: 0,
  total: 0,
  lastError: null,
  insideSaudiArabia: false,
  geoSource: 'auto',
};

function publish(patch: Partial<EngineState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

export function getEngineState(): EngineState {
  return state;
}

export function subscribeEngine(listener: (next: EngineState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

/**
 * Simple, permission-free location check: the device time zone plus the locale region.
 * Users can override it in the settings screen.
 */
export function detectInsideSaudiArabia(): boolean {
  try {
    const manual = window.localStorage.getItem('wakz.geoOverride');
    if (manual === 'inside') return true;
    if (manual === 'outside') return false;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    if (SAUDI_TIMEZONES.includes(timeZone)) return true;
    const locales = [navigator.language, ...(navigator.languages ?? [])];
    return locales.some((locale) => /-SA\b/i.test(locale));
  } catch {
    return false;
  }
}

export function geoIsManual(): boolean {
  try {
    return Boolean(window.localStorage.getItem('wakz.geoOverride'));
  } catch {
    return false;
  }
}

export function setGeoOverride(value: 'inside' | 'outside' | null): void {
  try {
    if (value === null) window.localStorage.removeItem('wakz.geoOverride');
    else window.localStorage.setItem('wakz.geoOverride', value);
  } catch {
    // Ignore storage failures.
  }
  publish({ insideSaudiArabia: detectInsideSaudiArabia(), geoSource: geoIsManual() ? 'manual' : 'auto' });
}

/** Services the current user may see. */
export function visibleServices(): ServiceDefinition[] {
  const inside = state.insideSaudiArabia;
  return SERVICES.filter((service) => (service.visibility === 'sa' ? inside : true));
}

export function visibleCategories(): CategoryDefinition[] {
  const inside = state.insideSaudiArabia;
  return CATEGORIES.filter((category) => (category.visibility === 'sa' ? inside : true));
}

function sortComponents(payload: LocalServicePayload): LocalServicePayload['components'] {
  return [...payload.components].sort((left, right) => {
    const byGroup = compareRegions(left.group ?? '', right.group ?? '');
    if (byGroup !== 0) return byGroup;
    return (left.position ?? 0) - (right.position ?? 0);
  });
}

function isFresh(record: LocalServiceRecord | null): boolean {
  if (!record) return false;
  return Date.now() - record.updatedAt < CACHE_TTL_MS;
}

export async function initialiseEngine(): Promise<void> {
  publish({ insideSaudiArabia: detectInsideSaudiArabia(), geoSource: geoIsManual() ? 'manual' : 'auto' });
  const lastRun = await getMeta<number>('lastRun');
  publish({ lastRun: lastRun ?? null });
}

export type RunOptions = { force?: boolean; slugs?: string[]; reason?: 'auto' | 'manual' };

export async function runCollection(options: RunOptions = {}): Promise<{ collected: number; skipped: number }> {
  if (state.running) return { collected: 0, skipped: 0 };
  const targets = visibleServices().filter((service) => !service.comingSoon);
  const filtered = options.slugs ? targets.filter((service) => options.slugs?.includes(service.slug)) : targets;

  const queue: ServiceDefinition[] = [];
  let skipped = 0;
  for (const service of filtered) {
    const record = await getServiceRecord(service.slug);
    if (!options.force && isFresh(record)) {
      skipped += 1;
      continue;
    }
    queue.push(service);
  }

  if (queue.length === 0) {
    publish({ lastRun: Date.now() });
    await putMeta('lastRun', Date.now());
    return { collected: 0, skipped };
  }

  publish({ running: true, startedAt: Date.now(), collected: 0, total: queue.length, lastError: null });
  let collected = 0;

  for (let offset = 0; offset < queue.length; offset += WAVE_SIZE) {
    const wave = queue.slice(offset, offset + WAVE_SIZE);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, wave.length) }, async () => {
      while (cursor < wave.length) {
        const service = wave[cursor++];
        if (!service) break;
        try {
        const previous = await getServiceRecord(service.slug);
        const payload = await collectServiceLocally(service);
        const history = [...(previous?.payload.history ?? []), {
          checkedAt: payload.officialCheckedAt ?? new Date().toISOString(),
          status: payload.officialStatus,
          latencyMs: payload.latency.https ?? payload.latency.http ?? null,
        }].slice(-HISTORY_LIMIT);

        await putServiceRecord({ slug: service.slug, updatedAt: Date.now(), payload: { ...payload, history } });

        const previousStatus = previous?.payload.officialStatus ?? null;
        if (previousStatus && previousStatus !== payload.officialStatus) {
          await addEvent({
            at: new Date().toISOString(),
            slug: service.slug,
            kind: 'status_changed',
            message: `official status changed from ${previousStatus} to ${payload.officialStatus}`,
            from: previousStatus,
            to: payload.officialStatus,
          });
        }
        const previousConnectivity = previous?.payload.connectivityStatus ?? null;
        if (previousConnectivity && previousConnectivity !== payload.connectivityStatus) {
          await addEvent({
            at: new Date().toISOString(),
            slug: service.slug,
            kind: 'connectivity_changed',
            message: `connectivity changed from ${previousConnectivity} to ${payload.connectivityStatus}`,
            from: previousConnectivity,
            to: payload.connectivityStatus,
          });
        }
        collected += 1;
        } catch (failure) {
          publish({ lastError: failure instanceof Error ? failure.message : String(failure) });
        }
        publish({ collected });
      }
    });
    await Promise.all(workers);
    if (offset + WAVE_SIZE < queue.length) {
      await new Promise((resolve) => setTimeout(resolve, WAVE_PAUSE_MS));
    }
  }

  const finishedAt = Date.now();
  await putMeta('lastRun', finishedAt);
  if (options.reason === 'manual') await putMeta('lastManualRefresh', finishedAt);
  publish({ running: false, lastRun: finishedAt, collected, total: queue.length });
  return { collected, skipped };
}

export async function manualRefreshAllowed(): Promise<{ allowed: boolean; waitSeconds: number }> {
  const last = (await getMeta<number>('lastManualRefresh')) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed >= MANUAL_REFRESH_COOLDOWN_MS) return { allowed: true, waitSeconds: 0 };
  return { allowed: false, waitSeconds: Math.ceil((MANUAL_REFRESH_COOLDOWN_MS - elapsed) / 1000) };
}

export async function lastManualRefreshAt(): Promise<number | null> {
  return (await getMeta<number>('lastManualRefresh')) ?? null;
}

export async function clearLocalCache(): Promise<void> {
  await clearLocalData();
  publish({ lastRun: null, collected: 0, total: 0 });
}

// ------------------------------------------------------------------ shaping for the UI

function historySlice(payload: LocalServicePayload, hours: number): { checkedAt: string; status: UnifiedStatus; latencyMs: number | null }[] {
  const since = Date.now() - hours * 3_600_000;
  return payload.history
    .filter((point) => Date.parse(point.checkedAt) >= since)
    .map((point) => ({ checkedAt: point.checkedAt, status: point.status as UnifiedStatus, latencyMs: point.latencyMs }));
}

function toCard(service: ServiceDefinition, payload: LocalServicePayload | null, categoryNameAr: string): ServiceCard {
  const official = (payload?.officialStatus ?? 'UNKNOWN') as UnifiedStatus;
  const connectivity = (payload?.connectivityStatus ?? 'UNKNOWN') as UnifiedStatus;
  const components = payload ? sortComponents(payload) : [];
  const componentSummary: Record<string, number> = {};
  for (const component of components) {
    componentSummary[component.status] = (componentSummary[component.status] ?? 0) + 1;
  }
  return {
    slug: service.slug,
    name: service.name,
    nameAr: service.nameAr,
    category: service.category,
    categoryNameAr,
    homepage: service.homepage,
    statusPage: service.statusPage,
    status: official !== 'UNKNOWN' ? official : connectivity,
    officialStatus: official,
    officialStatusRaw: payload?.officialStatusRaw ?? null,
    officialSourceKind: payload?.officialSourceKind ?? service.sourceKind,
    officialSourceUrl: payload?.officialSourceUrl ?? service.statusPage,
    officialCheckedAt: payload?.officialCheckedAt ?? null,
    officialConfidence: (payload?.officialConfidence ?? service.confidence) as ServiceCard['officialConfidence'],
    officialErrorMessage: payload?.officialErrorMessage ?? null,
    connectivityStatus: connectivity,
    connectivityCheckedAt: payload?.connectivityCheckedAt ?? null,
    latency: payload?.latency ?? { http: null, https: null, dns: null, tcp: null, icmp: null },
    activeIncidents: (payload?.incidents ?? []).filter((incident) => incident.resolvedAt === null).length,
    componentCount: components.length,
    componentSummary,
    limitation: service.limitation ?? null,
    limitationAr: service.limitationAr ?? null,
    comingSoon: Boolean(service.comingSoon),
  };
}

function toIncidentRecord(incident: LocalIncident): IncidentRecord {
  return {
    externalId: incident.externalId,
    kind: incident.kind,
    title: incident.title,
    status: incident.status,
    statusRaw: incident.statusRaw,
    impact: incident.impact as UnifiedStatus,
    startedAt: incident.startedAt,
    updatedAt: incident.updatedAt,
    resolvedAt: incident.resolvedAt,
    endsAt: incident.endsAt ?? null,
    description: incident.description,
    url: incident.url,
    components: incident.components,
  };
}

export async function localCategories(): Promise<CategorySnapshot[]> {
  const records = new Map((await getAllServiceRecords()).map((record) => [record.slug, record]));
  const services = visibleServices();
  return visibleCategories().map((category) => {
    const categoryServices = services.filter((service) => service.category === category.slug);
    const cards = categoryServices.map((service) => toCard(service, records.get(service.slug)?.payload ?? null, category.nameAr));
    const counts: Record<UnifiedStatus, number> = {
      OPERATIONAL: 0,
      DEGRADED: 0,
      PARTIAL_OUTAGE: 0,
      MAJOR_OUTAGE: 0,
      MAINTENANCE: 0,
      UNKNOWN: 0,
    };
    for (const card of cards) {
      counts[card.status as UnifiedStatus] = (counts[card.status as UnifiedStatus] ?? 0) + 1;
    }
    return {
      slug: category.slug,
      name: category.name,
      nameAr: category.nameAr,
      description: category.description,
      descriptionAr: category.descriptionAr,
      status: worstStatus(cards.map((card) => card.status as UnifiedStatus)),
      counts,
      services: cards,
    };
  });
}

export async function localOverview(): Promise<Overview> {
  const categories = await localCategories();
  const cards = categories.flatMap((category) => category.services);
  const counts: Record<UnifiedStatus, number> = {
    OPERATIONAL: 0,
    DEGRADED: 0,
    PARTIAL_OUTAGE: 0,
    MAJOR_OUTAGE: 0,
    MAINTENANCE: 0,
    UNKNOWN: 0,
  };
  let lastUpdate: string | null = null;
  for (const card of cards) {
    counts[card.status as UnifiedStatus] = (counts[card.status as UnifiedStatus] ?? 0) + 1;
    const stamps = [card.officialCheckedAt, card.connectivityCheckedAt].filter((value): value is string => Boolean(value));
    for (const stamp of stamps) {
      if (!lastUpdate || Date.parse(stamp) > Date.parse(lastUpdate)) lastUpdate = stamp;
    }
  }
  return {
    status: worstStatus(cards.map((card) => card.status as UnifiedStatus)),
    counts,
    services: cards.length,
    lastUpdate,
    categories: categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      nameAr: category.nameAr,
      description: category.description,
      descriptionAr: category.descriptionAr,
      status: category.status,
      counts: category.counts,
      services: category.services.length,
    })),
  };
}

export async function localServiceDetail(slug: string, hours: number): Promise<ServiceDetail | null> {
  const service = visibleServices().find((item) => item.slug === slug);
  if (!service) return null;
  const record = await getServiceRecord(slug);
  const category = CATEGORIES.find((item) => item.slug === service.category);
  const card = toCard(service, record?.payload ?? null, category?.nameAr ?? service.category);
  const payload = record?.payload;
  return {
    ...card,
    components: payload ? sortComponents(payload).map((component) => ({ ...component, status: component.status as UnifiedStatus })) : [],
    incidents: (payload?.incidents ?? []).map(toIncidentRecord),
    maintenances: (payload?.maintenances ?? []).map(toIncidentRecord),
    history: payload ? historySlice(payload, hours) : [],
    officialStatusDescription: payload?.officialStatusRaw ?? null,
    recentRuns: [],
  };
}

export async function localIncidents(limit: number): Promise<{ count: number; incidents: (IncidentRecord & { serviceSlug: string; serviceName: string })[] }> {
  const records = await getAllServiceRecords();
  const bySlug = new Map(records.map((record) => [record.slug, record.payload]));
  const incidents: (IncidentRecord & { serviceSlug: string; serviceName: string })[] = [];
  for (const service of visibleServices()) {
    const payload = bySlug.get(service.slug);
    if (!payload) continue;
    for (const incident of payload.incidents) {
      if (incident.resolvedAt !== null) continue;
      incidents.push({ ...toIncidentRecord(incident), serviceSlug: service.slug, serviceName: service.name });
    }
  }
  return { count: incidents.length, incidents: incidents.slice(0, limit) };
}

export async function localEvents(limit: number): Promise<{ service_slug: string; message: string; created_at: string; from_status: string | null; to_status: string | null }[]> {
  const events = await listEvents(limit);
  return events.map((event) => ({
    service_slug: event.slug,
    message: event.message,
    created_at: event.at,
    from_status: event.from,
    to_status: event.to,
  }));
}

export async function localSearch(query: string): Promise<{ query: string; results: { slug: string; name: string; category: string; matchedOn: string; detail: string | null }[] }> {
  const needle = query.toLowerCase().trim();
  const records = await getAllServiceRecords();
  const bySlug = new Map(records.map((record) => [record.slug, record.payload]));
  const results: { slug: string; name: string; category: string; matchedOn: string; detail: string | null }[] = [];
  for (const service of visibleServices()) {
    if (needle.length === 0) continue;
    if (service.name.toLowerCase().includes(needle) || (service.nameAr ?? '').includes(query.trim()) || service.slug.includes(needle)) {
      results.push({ slug: service.slug, name: service.name, category: service.category, matchedOn: 'service', detail: null });
    }
    for (const component of bySlug.get(service.slug)?.components ?? []) {
      if (component.name.toLowerCase().includes(needle)) {
        results.push({ slug: service.slug, name: service.name, category: service.category, matchedOn: 'component', detail: component.name });
      }
    }
  }
  for (const category of visibleCategories()) {
    if (category.name.toLowerCase().includes(needle) || category.nameAr.includes(query.trim())) {
      results.push({ slug: `category:${category.slug}`, name: category.name, category: category.slug, matchedOn: 'category', detail: null });
    }
  }
  return { query, results: results.slice(0, 20) };
}

export function isRemoteConfigured(): boolean {
  return getApiBase().length > 0 && (window.localStorage.getItem('wakz.preferRemote') ?? 'false') === 'true';
}
