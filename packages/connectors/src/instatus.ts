import { fetchResource } from '../../core/src/index.ts';
import type { Connector, ConnectorContext, ConnectorResult, UnifiedStatus } from '../../core/src/index.ts';
import { baseResult, failureResult } from './types.ts';

type InstatusSummary = {
  page?: { name?: string; url?: string; status?: string };
  activeIncidents?: { id?: string; name?: string; status?: string; impact?: string; started?: string; updated?: string; url?: string }[];
  activeMaintenances?: { id?: string; name?: string; status?: string; start?: string; end?: string; url?: string }[];
};

function mapInstatusStatus(status: string | undefined): UnifiedStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'UP':
    case 'OPERATIONAL':
      return 'OPERATIONAL';
    case 'DEGRADED':
    case 'HASISSUES':
      return 'DEGRADED';
    case 'PARTIAL':
      return 'PARTIAL_OUTAGE';
    case 'DOWN':
      return 'MAJOR_OUTAGE';
    case 'UNDERMAINTENANCE':
    case 'UNDER_MAINTENANCE':
      return 'MAINTENANCE';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Instatus status pages (used by several Gulf platforms, e.g. Salla) expose a small
 * machine-readable summary that is CORS enabled, so it also works in the local-first engine.
 */
export const instatusConnector: Connector = {
  id: 'instatus',
  label: 'Instatus status page',
  capabilities: { status: true, components: true, incidents: true, maintenance: true, regions: false },
  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const summaryUrl = String(ctx.service.connectorConfig.summaryUrl ?? '');
    if (!summaryUrl) return failureResult(ctx.service, ctx.now(), 'connectorConfig.summaryUrl missing');

    const response = await fetchResource<InstatusSummary>(summaryUrl, { timeoutMs: ctx.timeoutMs });
    if (!response.ok || !response.data) {
      return failureResult(ctx.service, ctx.now(), response.error ?? 'instatus summary unavailable', summaryUrl);
    }

    const summary = response.data;
    const raw = summary.page?.status ?? null;
    const status = mapInstatusStatus(raw ?? undefined);

    const incidents = [
      ...(summary.activeIncidents ?? []).map((incident, index) => ({
        externalId: incident.id ?? `incident-${index}`,
        kind: 'incident' as const,
        title: incident.name ?? 'Active incident',
        status: incident.status ?? 'investigating',
        statusRaw: (incident.status ?? 'investigating').toLowerCase(),
        impact: mapInstatusStatus(incident.impact ?? incident.status),
        startedAt: incident.started ? new Date(incident.started).toISOString() : null,
        updatedAt: incident.updated ? new Date(incident.updated).toISOString() : null,
        resolvedAt: null,
        description: null,
        url: incident.url ?? ctx.service.statusPage,
        components: [],
      })),
      ...(summary.activeMaintenances ?? []).map((maintenance, index) => ({
        externalId: maintenance.id ?? `maintenance-${index}`,
        kind: 'maintenance' as const,
        title: maintenance.name ?? 'Scheduled maintenance',
        status: maintenance.status ?? 'scheduled',
        statusRaw: (maintenance.status ?? 'scheduled').toLowerCase(),
        impact: 'MAINTENANCE' as UnifiedStatus,
        startedAt: maintenance.start ? new Date(maintenance.start).toISOString() : null,
        updatedAt: maintenance.end ? new Date(maintenance.end).toISOString() : null,
        resolvedAt: null,
        endsAt: maintenance.end ? new Date(maintenance.end).toISOString() : null,
        description: null,
        url: maintenance.url ?? ctx.service.statusPage,
        components: [],
      })),
    ];

    const components = Object.entries(summary as Record<string, unknown>)
      .filter(([key]) => key === 'components')
      .flatMap(([, value]) => (Array.isArray(value) ? (value as { id?: string; name?: string; status?: string }[]) : []))
      .map((component, index) => ({
        externalId: component.id ?? `component-${index}`,
        name: component.name ?? `Component ${index + 1}`,
        group: summary.page?.name ?? null,
        status: mapInstatusStatus(component.status),
        statusRaw: component.status ?? 'unknown',
        position: index,
      }));

    return baseResult(ctx.service, ctx.now(), {
      status,
      statusRaw: raw,
      sourceUrl: String(ctx.service.connectorConfig.pageUrl ?? summaryUrl),
      components,
      incidents,
      metadata: {
        provider: 'instatus',
        pageName: summary.page?.name ?? null,
        activeIncidents: summary.activeIncidents?.length ?? 0,
        activeMaintenances: summary.activeMaintenances?.length ?? 0,
      },
      notes: ['provider=instatus', `page_status=${raw ?? 'unknown'}`],
    });
  },
};
