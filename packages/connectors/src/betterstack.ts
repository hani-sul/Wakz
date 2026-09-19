import { fetchResource, mapStatusText, worstStatus } from '../../core/src/index.ts';
import type { ComponentState, Connector, ConnectorContext, ConnectorResult, IncidentRecord } from '../../core/src/index.ts';
import { baseResult, failureResult, toIso } from './types.ts';

type BetterStackPayload = {
  data?: { id: string; attributes: { company_name: string; aggregate_state: string; updated_at?: string } };
  included?: {
    id: string;
    type: string;
    attributes: Record<string, unknown>;
  }[];
};

export const betterStackConnector: Connector = {
  id: 'betterstack',
  label: 'Better Stack status page',
  capabilities: { status: true, components: true, incidents: true, maintenance: true, regions: false },
  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const indexUrl = String(ctx.service.connectorConfig.indexUrl ?? '');
    if (!indexUrl) return failureResult(ctx.service, ctx.now(), 'connectorConfig.indexUrl missing');

    const response = await fetchResource<BetterStackPayload>(indexUrl, { timeoutMs: ctx.timeoutMs });
    if (!response.ok || !response.data?.data) {
      return failureResult(ctx.service, ctx.now(), response.error ?? 'better stack index unavailable', indexUrl);
    }

    const payload = response.data;
    if (!payload.data) return failureResult(ctx.service, ctx.now(), 'better stack payload missing data', indexUrl);
    const attributes = payload.data.attributes;
    const included = payload.included ?? [];

    const sections = new Map<string, string>();
    for (const item of included) {
      if (item.type === 'status_page_section') {
        sections.set(item.id, String(item.attributes.name ?? 'Section'));
      }
    }

    const components: ComponentState[] = included
      .filter((item) => item.type === 'status_page_resource')
      .map((item, index) => {
        const sectionId = String(item.attributes.status_page_section_id ?? '');
        const rawStatus = String(item.attributes.status ?? item.attributes.aggregate_state ?? 'unknown');
        return {
          externalId: item.id,
          name: String(item.attributes.name ?? 'Resource'),
          group: sections.get(sectionId) ?? null,
          status: mapStatusText(rawStatus),
          statusRaw: rawStatus,
          position: Number(item.attributes.position ?? index),
        };
      });

    const reports: IncidentRecord[] = included
      .filter((item) => item.type === 'status_report')
      .map((item) => {
        const rawStatus = String(item.attributes.status ?? item.attributes.state ?? 'unknown');
        const isResolved = /resolved|completed/i.test(rawStatus) || Boolean(item.attributes.resolved_at);
        const title = String(item.attributes.title ?? item.attributes.name ?? 'Status report');
        const body = String(item.attributes.description ?? item.attributes.body ?? '').slice(0, 1200);
        return {
          externalId: `${item.type}:${item.id}`,
          kind: /maintenance/i.test(String(item.attributes.type ?? '')) ? 'maintenance' as const : 'incident' as const,
          title,
          status: rawStatus,
          statusRaw: rawStatus.toLowerCase(),
          impact: mapStatusText(rawStatus === 'resolved' ? 'operational' : rawStatus),
          startedAt: toIso(String(item.attributes.starts_at ?? item.attributes.created_at ?? '')),
          updatedAt: toIso(String(item.attributes.updated_at ?? item.attributes.created_at ?? '')),
          resolvedAt: isResolved ? toIso(String(item.attributes.resolved_at ?? item.attributes.updated_at ?? '')) : null,
          description: body || null,
          url: ctx.service.statusPage,
          components: [],
        };
      });

    const aggregate = mapStatusText(attributes.aggregate_state);
    const activeIncidents = reports.filter((incident) => incident.resolvedAt === null && incident.kind === 'incident');
    const derived = aggregate !== 'UNKNOWN'
      ? aggregate
      : worstStatus(activeIncidents.map((incident) => incident.impact));

    return baseResult(ctx.service, ctx.now(), {
      status: derived,
      statusRaw: attributes.aggregate_state,
      sourceUrl: String(ctx.service.connectorConfig.pageUrl ?? indexUrl),
      components,
      incidents: reports.slice(0, 30),
      metadata: {
        provider: 'better-stack',
        aggregateState: attributes.aggregate_state,
        componentCount: components.length,
        resourceCount: components.length,
        updateCount: included.filter((item) => item.type === 'status_update').length,
        reportCount: reports.length,
      },
      notes: ['provider=better-stack', `aggregate_state=${attributes.aggregate_state}`],
    });
  },
};
