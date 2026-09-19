import { fetchResource, worstStatus } from '../../core/src/index.ts';
import type { ComponentState, Connector, ConnectorContext, ConnectorResult, IncidentRecord, UnifiedStatus } from '../../core/src/index.ts';
import { baseResult, failureResult, toIso, uniqueBy } from './types.ts';

type GoogleIncident = {
  id: string;
  number?: string;
  begin?: string;
  end?: string | null;
  created?: string;
  modified?: string;
  external_desc: string;
  status_impact: string;
  affected_products?: { id: string; title: string }[];
  updates?: { created: string; modified?: string; text: string; status: string; when?: string }[];
  uri?: string;
};

function impactToStatus(impact: string | undefined, end: string | null | undefined): UnifiedStatus {
  if (end) return 'OPERATIONAL';
  switch ((impact ?? '').toUpperCase()) {
    case 'SERVICE_OUTAGE':
      return 'MAJOR_OUTAGE';
    case 'SERVICE_DISRUPTION':
      return 'PARTIAL_OUTAGE';
    case 'SERVICE_INFORMATION':
      return 'DEGRADED';
    default:
      return 'DEGRADED';
  }
}

export const googleCloudConnector: Connector = {
  id: 'google-cloud',
  label: 'Google Cloud incidents feed',
  capabilities: { status: true, components: true, incidents: true, maintenance: false, regions: false },
  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const incidentsUrl = String(ctx.service.connectorConfig.incidentsUrl ?? '');
    const productFilter = (ctx.service.connectorConfig.productFilter as string[] | undefined) ?? null;
    if (!incidentsUrl) return failureResult(ctx.service, ctx.now(), 'connectorConfig.incidentsUrl missing');

    const response = await fetchResource<GoogleIncident[]>(incidentsUrl, { timeoutMs: ctx.timeoutMs });
    if (!response.ok || !Array.isArray(response.data)) {
      return failureResult(ctx.service, ctx.now(), response.error ?? 'incidents feed unavailable', incidentsUrl);
    }

    const filterMatcher = (incident: GoogleIncident): boolean => {
      if (!productFilter || productFilter.length === 0) return true;
      const products = (incident.affected_products ?? []).map((product) => product.title.toLowerCase());
      if (products.length === 0) return false;
      return products.some((title) => productFilter.some((needle) => title.includes(needle)));
    };

    const relevant = response.data.filter(filterMatcher);
    const active = relevant.filter((incident) => !incident.end);

    const incidents: IncidentRecord[] = relevant.slice(0, 30).map((incident) => {
      const latestUpdate = incident.updates?.[incident.updates.length - 1];
      return {
        externalId: incident.id,
        kind: 'incident',
        title: incident.external_desc?.slice(0, 200) ?? incident.id,
        status: incident.end ? 'resolved' : 'active',
        statusRaw: incident.end ? 'resolved' : 'active',
        impact: impactToStatus(incident.status_impact, incident.end),
        startedAt: toIso(incident.begin ?? incident.created),
        updatedAt: toIso(latestUpdate?.modified ?? latestUpdate?.created ?? incident.modified),
        resolvedAt: toIso(incident.end ?? null),
        description: latestUpdate?.text?.slice(0, 1200) ?? null,
        url: incident.uri ?? ctx.service.statusPage,
        components: (incident.affected_products ?? []).map((product) => product.title),
      };
    });

    const components: ComponentState[] = uniqueBy(
      relevant.flatMap((incident) => incident.affected_products ?? []).map((product) => product.title),
      (title) => title,
    ).slice(0, 40).map((title, index) => {
      const lastIncident = relevant.find((incident) => (incident.affected_products ?? []).some((product) => product.title === title));
      const status = lastIncident ? impactToStatus(lastIncident.status_impact, lastIncident.end) : 'UNKNOWN';
      return {
        externalId: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: title,
        group: 'Affected products (recent incidents)',
        status,
        statusRaw: lastIncident?.status_impact ?? 'unknown',
        position: index,
      };
    });

    const status = active.length > 0
      ? worstStatus(active.map((incident) => impactToStatus(incident.status_impact, incident.end)))
      : 'OPERATIONAL';

    return baseResult(ctx.service, ctx.now(), {
      status,
      statusRaw: active.length > 0
        ? `${active.length} active Google Cloud incident(s)`
        : 'no active incidents in Google Cloud feed',
      sourceUrl: String(ctx.service.connectorConfig.pageUrl ?? incidentsUrl),
      components,
      incidents,
      metadata: {
        provider: 'google-cloud',
        incidentsInFeed: response.data.length,
        relevantIncidents: relevant.length,
        activeIncidents: active.length,
        productFilterApplied: productFilter !== null,
      },
      notes: ['provider=google-cloud', `feed=${response.data.length} incidents`],
    });
  },
};
