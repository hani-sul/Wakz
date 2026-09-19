import { fetchResource, mapStatusText, worstStatus } from '../../core/src/index.ts';
import type { ComponentState, Connector, ConnectorContext, ConnectorResult, IncidentRecord } from '../../core/src/index.ts';
import { baseResult, failureResult, toIso } from './types.ts';

type NuvioComponent = {
  id: string; name: string; description?: string | null; status: string;
  latencyMs?: number | null; lastCheckedAt?: string | null; uptime90d?: number | null; summary?: string | null;
};
type NuvioIncident = {
  id?: string; title?: string; name?: string; status?: string; impact?: string;
  startedAt?: string; updatedAt?: string; resolvedAt?: string | null; description?: string | null;
  components?: string[] | { name: string }[];
};
type NuvioPayload = {
  siteName?: string;
  overallStatus?: string;
  overallLabel?: string;
  generatedAt?: string;
  lastCheckedAt?: string;
  components?: NuvioComponent[];
  activeIncidents?: NuvioIncident[];
  pastIncidents?: NuvioIncident[];
};

function toIncident(raw: NuvioIncident, resolved: boolean, fallbackUrl: string | null): IncidentRecord {
  const statusRaw = (raw.status ?? (resolved ? 'resolved' : 'investigating')).toLowerCase();
  return {
    externalId: raw.id ?? `${raw.title ?? raw.name ?? 'incident'}:${raw.startedAt ?? ''}`,
    kind: 'incident',
    title: raw.title ?? raw.name ?? 'Nuvio incident',
    status: raw.status ?? (resolved ? 'resolved' : 'investigating'),
    statusRaw,
    impact: resolved ? 'OPERATIONAL' : mapStatusText(raw.impact ?? raw.status ?? 'investigating'),
    startedAt: toIso(raw.startedAt),
    updatedAt: toIso(raw.updatedAt ?? raw.startedAt),
    resolvedAt: resolved ? toIso(raw.resolvedAt ?? raw.updatedAt ?? raw.startedAt) : null,
    description: raw.description ? String(raw.description).slice(0, 1200) : null,
    url: fallbackUrl,
    components: Array.isArray(raw.components)
      ? raw.components.map((component) => (typeof component === 'string' ? component : component.name))
      : [],
  };
}

export const nuvioStatusConnector: Connector = {
  id: 'nuvio-status',
  label: 'Nuvio status API',
  capabilities: { status: true, components: true, incidents: true, maintenance: false, regions: false },
  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const statusUrl = String(ctx.service.connectorConfig.statusUrl ?? '');
    if (!statusUrl) return failureResult(ctx.service, ctx.now(), 'connectorConfig.statusUrl missing');

    const response = await fetchResource<NuvioPayload>(statusUrl, { timeoutMs: ctx.timeoutMs, maxBytes: 6_000_000 });
    if (!response.ok || !response.data) {
      return failureResult(ctx.service, ctx.now(), response.error ?? 'nuvio status unavailable', statusUrl);
    }

    const payload = response.data;
    const status = mapStatusText(payload.overallStatus ?? payload.overallLabel ?? null);
    const components: ComponentState[] = (payload.components ?? []).map((component, index) => ({
      externalId: component.id,
      name: component.name,
      group: component.description ?? null,
      status: mapStatusText(component.status),
      statusRaw: component.summary ? `${component.status} — ${component.summary}` : component.status,
      position: index,
    }));

    const incidents = [
      ...(payload.activeIncidents ?? []).map((incident) => toIncident(incident, false, ctx.service.statusPage)),
      ...(payload.pastIncidents ?? []).slice(0, 20).map((incident) => toIncident(incident, true, ctx.service.statusPage)),
    ];

    const worstComponent = components.length > 0 ? worstStatus(components.map((component) => component.status)) : 'UNKNOWN';
    const derived = worstStatus([
      status,
      worstComponent,
      ...(payload.activeIncidents ?? []).map((incident) => mapStatusText(incident.impact ?? incident.status ?? null)),
    ]);

    return baseResult(ctx.service, ctx.now(), {
      status: derived,
      statusRaw: payload.overallLabel ?? payload.overallStatus ?? null,
      sourceUrl: String(ctx.service.connectorConfig.pageUrl ?? statusUrl),
      components,
      incidents,
      metadata: {
        provider: 'nuvio',
        lastCheckedAt: payload.lastCheckedAt ?? null,
        generatedAt: payload.generatedAt ?? null,
        componentCount: components.length,
        activeIncidents: payload.activeIncidents?.length ?? 0,
      },
      notes: ['provider=nuvio status API'],
    });
  },
};
