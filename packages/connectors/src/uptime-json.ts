import { fetchResource, worstStatus } from '../../core/src/index.ts';
import type { ComponentState, Connector, ConnectorContext, ConnectorResult, IncidentRecord, UnifiedStatus } from '../../core/src/index.ts';
import { baseResult, failureResult, toIso } from './types.ts';

type MonitorList = {
  status?: string;
  data?: {
    monitorId?: number; name?: string; statusClass?: string; groupName?: string; url?: string | null;
    type?: string; dailyRatios?: { date: string; ratio: string }[];
  }[];
  statistics?: unknown;
  days?: unknown;
};

type EventFeed = {
  status?: boolean;
  results?: {
    id?: number | string; eventId?: number | string; name?: string; title?: string; status?: string;
    type?: string; createdAt?: string; updatedAt?: string; at?: string; description?: string; message?: string;
  }[];
};

function statusClassToStatus(statusClass: string | undefined): UnifiedStatus {
  switch ((statusClass ?? '').toLowerCase()) {
    case 'success':
    case 'up':
    case 'operational':
      return 'OPERATIONAL';
    case 'warning':
    case 'degraded':
      return 'DEGRADED';
    case 'danger':
    case 'down':
    case 'outage':
      return 'MAJOR_OUTAGE';
    case 'maintenance':
      return 'MAINTENANCE';
    default:
      return 'UNKNOWN';
  }
}

export const uptimeJsonConnector: Connector = {
  id: 'uptime-json',
  label: 'Status page JSON API (monitor list)',
  capabilities: { status: true, components: true, incidents: true, maintenance: true, regions: false },
  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const monitorsUrl = String(ctx.service.connectorConfig.monitorsUrl ?? '');
    const eventsUrl = ctx.service.connectorConfig.eventsUrl ? String(ctx.service.connectorConfig.eventsUrl) : null;
    if (!monitorsUrl) return failureResult(ctx.service, ctx.now(), 'connectorConfig.monitorsUrl missing');

    const [monitors, events] = await Promise.all([
      fetchResource<MonitorList>(monitorsUrl, { timeoutMs: ctx.timeoutMs }),
      eventsUrl ? fetchResource<EventFeed>(eventsUrl, { timeoutMs: ctx.timeoutMs }) : Promise.resolve(null),
    ]);

    if (!monitors.ok || !monitors.data?.data) {
      return failureResult(ctx.service, ctx.now(), monitors.error ?? 'monitor list unavailable', monitorsUrl);
    }

    const components: ComponentState[] = monitors.data.data.map((monitor, index) => ({
      externalId: String(monitor.monitorId ?? index),
      name: monitor.name ?? `Monitor ${index + 1}`,
      group: monitor.groupName ?? null,
      status: statusClassToStatus(monitor.statusClass),
      statusRaw: monitor.statusClass ?? 'unknown',
      position: index,
    }));

    const incidents: IncidentRecord[] = (events?.data?.results ?? []).map((event, index) => {
      const statusRaw = (event.status ?? 'unknown').toLowerCase();
      const resolved = /resolved|completed|success/i.test(statusRaw);
      return {
        externalId: String(event.eventId ?? event.id ?? index),
        kind: /maintenance/i.test(`${event.type ?? ''} ${event.name ?? ''}`) ? 'maintenance' as const : 'incident' as const,
        title: event.title ?? event.name ?? `Event ${index + 1}`,
        status: event.status ?? 'unknown',
        statusRaw,
        impact: resolved ? 'OPERATIONAL' : statusClassToStatus(event.status),
        startedAt: toIso(event.createdAt ?? event.at ?? null),
        updatedAt: toIso(event.updatedAt ?? event.createdAt ?? event.at ?? null),
        resolvedAt: resolved ? toIso(event.updatedAt ?? event.createdAt ?? event.at ?? null) : null,
        description: (event.description ?? event.message ?? null)?.slice(0, 1200) ?? null,
        url: String(ctx.service.connectorConfig.pageUrl ?? monitorsUrl),
        components: [],
      };
    });

    const activeIncidents = incidents.filter((incident) => incident.resolvedAt === null && incident.kind === 'incident');
    const status = components.length > 0
      ? worstStatus(components.map((component) => component.status))
      : worstStatus(activeIncidents.map((incident) => incident.impact));

    return baseResult(ctx.service, ctx.now(), {
      status,
      statusRaw: components.length > 0
        ? `worst of ${components.length} monitored endpoints`
        : 'no monitors reported',
      sourceUrl: String(ctx.service.connectorConfig.pageUrl ?? monitorsUrl),
      components,
      incidents,
      metadata: {
        provider: 'uptime-json',
        monitors: components.length,
        events: incidents.length,
        activeIncidents: activeIncidents.length,
        eventsFeedAvailable: Boolean(eventsUrl),
      },
      notes: ['provider=uptime-json', `monitors=${components.length}`],
    });
  },
};
