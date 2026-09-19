import { api } from './api.ts';
import type { CategorySnapshot, IncidentRecord, Overview, ServiceCard, ServiceDetail } from './api.ts';
import { getApiBase } from './lib/appConfig.ts';
import * as local from './engine/engine.ts';

export type { EngineState } from './engine/engine.ts';

export type DataMode = 'local' | 'remote';

const PREFER_REMOTE_KEY = 'wakz.preferRemote';

export function dataMode(): DataMode {
  try {
    const preferRemote = window.localStorage.getItem(PREFER_REMOTE_KEY) === 'true';
    return preferRemote && getApiBase().length > 0 ? 'remote' : 'local';
  } catch {
    return 'local';
  }
}

export function setDataMode(mode: DataMode): void {
  try {
    window.localStorage.setItem(PREFER_REMOTE_KEY, mode === 'remote' ? 'true' : 'false');
  } catch {
    // Ignore storage failures.
  }
}

function remote(): boolean {
  return dataMode() === 'remote';
}

/**
 * Single entry point for the interface. By default everything is measured and stored on the
 * device (local-first); a server is used only when the user explicitly configures one.
 */
export const data = {
  mode: dataMode,

  overview: (): Promise<Overview> => (remote() ? api.overview() : local.localOverview()),
  categories: (): Promise<CategorySnapshot[]> => (remote() ? api.categories() : local.localCategories()),
  service: (slug: string, hours = 24): Promise<ServiceDetail> =>
    remote()
      ? api.service(slug, hours)
      : local.localServiceDetail(slug, hours).then((detail) => {
        if (!detail) throw new Error(`service_not_found:${slug}`);
        return detail;
      }),
  services: async (params: { category?: string; q?: string; status?: string } = {}): Promise<ServiceCard[]> => {
    if (remote()) return api.services(params);
    const categories = await local.localCategories();
    const needle = params.q?.toLowerCase().trim();
    return categories
      .filter((category) => !params.category || category.slug === params.category)
      .flatMap((category) => category.services)
      .filter((service) => {
        if (!params.status) return true;
        return service.status === params.status || service.officialStatus === params.status || service.connectivityStatus === params.status;
      })
      .filter((service) => {
        if (!needle) return true;
        return service.name.toLowerCase().includes(needle) || (service.nameAr ?? '').includes(params.q?.trim() ?? '') || service.slug.includes(needle);
      });
  },
  incidents: (limit = 50): Promise<{ count: number; incidents: (IncidentRecord & { serviceSlug: string; serviceName: string })[] }> =>
    remote() ? api.incidents(limit) : local.localIncidents(limit),
  events: (limit = 50) => (remote() ? api.events(limit) : local.localEvents(limit)),
  search: (query: string) => (remote() ? api.search(query) : local.localSearch(query)),
  health: () => (remote() ? api.health() : Promise.resolve({ ok: true, database: {}, catalog: { services: local.visibleServices().length } })),

  refresh: (options: { force?: boolean; slugs?: string[]; reason?: 'auto' | 'manual' } = {}) => local.runCollection(options),
  refreshState: () => local.getEngineState(),
  subscribe: (listener: (state: local.EngineState) => void) => local.subscribeEngine(listener),
  manualRefreshAllowed: () => local.manualRefreshAllowed(),
  clearCache: () => local.clearLocalCache(),
  visibleServices: () => local.visibleServices(),
  visibleCategories: () => local.visibleCategories(),
  location: {
    insideSaudiArabia: () => local.getEngineState().insideSaudiArabia,
    isManual: () => local.geoIsManual(),
    setOverride: (value: 'inside' | 'outside' | null) => local.setGeoOverride(value),
    detect: () => local.detectInsideSaudiArabia(),
  },
  initialise: () => local.initialiseEngine(),
};
