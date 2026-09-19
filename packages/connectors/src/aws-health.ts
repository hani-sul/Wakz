import { fetchResource, worstStatus } from '../../core/src/index.ts';
import type { ComponentState, Connector, ConnectorContext, ConnectorResult, IncidentRecord, RegionStatus, UnifiedStatus } from '../../core/src/index.ts';
import { baseResult, failureResult, statusFromNumbers, toIso } from './types.ts';

type AwsHealthEvent = {
  date: string;
  arn: string;
  region_name?: string;
  status?: string;
  service?: string;
  service_name?: string;
  summary?: string;
  event_log?: { summary: string; message: string; status: number; timestamp: number }[];
  impacted_services?: { service: string; service_name: string; current_status: string }[];
  impacted_service_status_changes?: { service: string; service_name: string; previous_status: string; current_status: string; timestamp: number }[];
};

function latestServiceStatuses(event: AwsHealthEvent): Map<string, { name: string; status: number; timestamp: number }> {
  const map = new Map<string, { name: string; status: number; timestamp: number }>();
  for (const change of event.impacted_service_status_changes ?? []) {
    const current = map.get(change.service);
    const timestamp = change.timestamp ?? 0;
    if (!current || timestamp >= current.timestamp) {
      map.set(change.service, { name: change.service_name, status: Number(change.current_status), timestamp });
    }
  }
  return map;
}

export const awsHealthConnector: Connector = {
  id: 'aws-health',
  label: 'AWS Health public events',
  capabilities: { status: true, components: true, incidents: true, maintenance: false, regions: true },
  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const eventsUrl = String(ctx.service.connectorConfig.eventsUrl ?? '');
    if (!eventsUrl) return failureResult(ctx.service, ctx.now(), 'connectorConfig.eventsUrl missing');

    const response = await fetchResource<AwsHealthEvent[]>(eventsUrl, { timeoutMs: ctx.timeoutMs, maxBytes: 12_000_000 });
    if (!response.ok) {
      return failureResult(ctx.service, ctx.now(), response.error ?? 'AWS health feed unavailable', eventsUrl);
    }
    const events: AwsHealthEvent[] = Array.isArray(response.data) ? response.data : [];

    const components: ComponentState[] = [];
    const incidents: IncidentRecord[] = [];
    const regions: RegionStatus[] = [];
    const statuses: UnifiedStatus[] = [];

    events.forEach((event, eventIndex) => {
      const serviceStatuses = latestServiceStatuses(event);
      const impactLevels = [...serviceStatuses.values()].map((entry) => entry.status);
      const eventStatus = impactLevels.length > 0
        ? statusFromNumbers(Math.max(...impactLevels))
        : statusFromNumbers(Number(event.status ?? 0));
      statuses.push(eventStatus);

      if (event.region_name) {
        regions.push({
          region: event.region_name,
          status: eventStatus,
          statusRaw: `${event.summary ?? 'event'} (status ${event.status ?? 'unknown'})`,
          detail: event.arn,
        });
      }

      let position = 0;
      for (const [serviceId, entry] of serviceStatuses) {
        if (entry.status === 0) continue;
        components.push({
          externalId: `${eventIndex}:${serviceId}`,
          name: entry.name,
          group: event.region_name ?? 'Global',
          status: statusFromNumbers(entry.status),
          statusRaw: `AWS status ${entry.status}`,
          position: position++,
        });
      }

      const lastLog = event.event_log?.[event.event_log.length - 1];
      incidents.push({
        externalId: event.arn,
        kind: 'incident',
        title: `${event.service_name ?? 'AWS'} — ${event.summary ?? 'Service event'}${event.region_name ? ` (${event.region_name})` : ''}`,
        status: eventStatus === 'OPERATIONAL' ? 'recovered' : 'ongoing',
        statusRaw: eventStatus === 'OPERATIONAL' ? 'recovered' : 'ongoing',
        impact: eventStatus,
        startedAt: toIso(Number(event.date)),
        updatedAt: toIso(lastLog?.timestamp),
        resolvedAt: eventStatus === 'OPERATIONAL' ? toIso(lastLog?.timestamp) : null,
        description: lastLog?.message?.slice(0, 1500) ?? null,
        url: 'https://health.aws.amazon.com/health/status',
        components: [...serviceStatuses.values()].filter((entry) => entry.status > 0).slice(0, 20).map((entry) => entry.name),
      });
    });

    const status = statuses.length > 0 ? worstStatus(statuses) : 'OPERATIONAL';
    const regionNames = [...new Set(regions.map((region) => region.region))];
    const affectedRegions = [...new Set(regions.filter((region) => region.status !== 'OPERATIONAL').map((region) => region.region))];
    const statusRaw = events.length === 0
      ? 'no events in AWS Health feed'
      : affectedRegions.length > 0
        ? `${events.length} event(s) in AWS Health feed — affected regions: ${affectedRegions.join(', ')}`
        : `${events.length} event(s) in AWS Health feed, all recovered`;

    return baseResult(ctx.service, ctx.now(), {
      status,
      statusRaw,
      sourceUrl: String(ctx.service.connectorConfig.pageUrl ?? eventsUrl),
      components,
      incidents,
      regions,
      metadata: {
        provider: 'aws-health',
        events: events.length,
        regions: regionNames,
        affectedRegions,
        feedEncoding: 'UTF-16',
      },
      notes: ['provider=aws-health', `events=${events.length}`],
    });
  },
};
