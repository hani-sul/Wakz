import { fetchResource, mapStatusIoCode, worstStatus } from '../../core/src/index.ts';
import type { Connector, ConnectorContext, ConnectorResult } from '../../core/src/index.ts';
import { baseResult, failureResult, toIso } from './types.ts';

type StatusIoResponse = {
  result?: {
    status_overall?: { status: string; status_code: number; updated: string };
    status?: {
      id: string; name: string; status: string; status_code: number; updated?: string;
      containers?: { id: string; name: string; status: string; status_code: number; updated?: string }[];
    }[];
    incidents?: { _id: string; name: string; status: string; datetime_open?: string; datetime?: string; message?: string; components?: { name: string }[] }[];
  };
  error?: string;
};

export const statusIoConnector: Connector = {
  id: 'statusio',
  label: 'status.io',
  capabilities: { status: true, components: true, incidents: true, maintenance: false, regions: false },
  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const baseUrl = String(ctx.service.connectorConfig.baseUrl ?? 'https://api.status.io/1.0/status');
    const pageId = String(ctx.service.connectorConfig.pageId ?? '');
    if (!pageId) return failureResult(ctx.service, ctx.now(), 'connectorConfig.pageId missing');
    const url = `${baseUrl}/${pageId}`;

    const response = await fetchResource<StatusIoResponse>(url, { timeoutMs: ctx.timeoutMs });
    if (!response.ok || !response.data?.result) {
      return failureResult(ctx.service, ctx.now(), response.error ?? response.data?.error ?? 'status.io request failed', url);
    }

    const result = response.data.result;
    const overall = result.status_overall;
    const status = mapStatusIoCode(overall?.status_code ?? null, overall?.status);

    const components = (result.status ?? []).flatMap((group) =>
      (group.containers ?? []).map((container, index) => ({
        externalId: container.id,
        name: container.name,
        group: group.name,
        status: mapStatusIoCode(container.status_code, container.status),
        statusRaw: container.status,
        position: index,
      })),
    );

    const incidents = (result.incidents ?? []).map((incident) => ({
      externalId: incident._id,
      kind: 'incident' as const,
      title: incident.name,
      status: incident.status,
      statusRaw: incident.status.toLowerCase(),
      impact: mapStatusIoCode(null, incident.status),
      startedAt: toIso(incident.datetime_open ?? incident.datetime),
      updatedAt: toIso(incident.datetime),
      resolvedAt: /resolved|completed/i.test(incident.status) ? toIso(incident.datetime) : null,
      description: incident.message ? String(incident.message).slice(0, 1200) : null,
      url: ctx.service.statusPage,
      components: (incident.components ?? []).map((component) => component.name),
    }));

    const activeIncidents = incidents.filter((incident) => incident.resolvedAt === null);
    const worstComponent = components.length > 0 ? worstStatus(components.map((component) => component.status)) : 'UNKNOWN';
    const derived = activeIncidents.length > 0
      ? worstStatus([status, worstStatus(activeIncidents.map((incident) => incident.impact))])
      : status;

    return baseResult(ctx.service, ctx.now(), {
      status: derived,
      statusRaw: overall?.status ?? null,
      sourceUrl: String(ctx.service.connectorConfig.pageUrl ?? url),
      components,
      incidents,
      metadata: {
        provider: 'status.io',
        statusCode: overall?.status_code ?? null,
        groupCount: (result.status ?? []).length,
        componentCount: components.length,
        componentsStatus: worstComponent,
      },
      notes: ['provider=status.io', `overall=${overall?.status ?? 'unknown'}`],
    });
  },
};
