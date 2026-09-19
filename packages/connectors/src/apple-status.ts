import { fetchResource } from '../../core/src/index.ts';
import type { Connector, ConnectorContext, ConnectorResult, IncidentRecord, UnifiedStatus } from '../../core/src/index.ts';
import { baseResult, failureResult, toIso } from './types.ts';

type AppleEvent = {
  statusType?: string;
  eventStatus?: string;
  usersAffected?: string;
  message?: string;
  eventMessage?: string;
  epochStartDate?: number;
  epochEndDate?: number;
  startDate?: string;
  endDate?: string;
};

type AppleService = {
  serviceName?: string;
  events?: AppleEvent[];
};

function mapAppleStatus(value: string | undefined): UnifiedStatus {
  const status = (value ?? '').toLowerCase();
  if (!status || status.includes('normal') || status.includes('resolved') || status.includes('completed')) return 'OPERATIONAL';
  if (status.includes('maintenance') || status.includes('scheduled')) return 'MAINTENANCE';
  if (status.includes('outage') || status.includes('down')) return 'MAJOR_OUTAGE';
  if (status.includes('degraded') || status.includes('issue') || status.includes('performance') || status.includes('disruption')) return 'DEGRADED';
  return 'DEGRADED';
}

/**
 * Apple publishes one feed for all of its services as a JavaScript payload
 * (`json.system_status = {...}`) that the official status page consumes.
 */
export const appleStatusConnector: Connector = {
  id: 'apple-status',
  label: 'Apple system status feed',
  capabilities: { status: true, components: true, incidents: true, maintenance: true, regions: false },
  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const feedUrl = String(ctx.service.connectorConfig.feedUrl ?? '');
    if (!feedUrl) return failureResult(ctx.service, ctx.now(), 'connectorConfig.feedUrl missing');

    const response = await fetchResource(feedUrl, { timeoutMs: ctx.timeoutMs, maxBytes: 4_000_000 });
    if (!response.ok || !response.text) {
      return failureResult(ctx.service, ctx.now(), response.error ?? 'Apple status feed unavailable', feedUrl);
    }

    // The feed is plain JSON in practice; strip a possible `json.system_status =` prefix.
    const payloadText = response.text.replace(/^\s*(?:var\s+)?(?:json\.)?system_status\s*=\s*/i, '').replace(/;\s*$/, '');
    let payload: { services?: AppleService[] } | null = response.data ?? null;
    if (!payload) {
      try {
        payload = JSON.parse(payloadText) as { services?: AppleService[] };
      } catch {
        return failureResult(ctx.service, ctx.now(), 'unparsable Apple status payload', feedUrl);
      }
    }

    const services = payload?.services ?? [];
    const affected = services.filter((service) => (service.events ?? []).length > 0);

    const components = affected.slice(0, 40).map((service, index) => {
      const event = (service.events ?? [])[0] as AppleEvent;
      const raw = event.statusType ?? event.eventStatus ?? 'issue';
      return {
        externalId: `apple:${service.serviceName ?? index}`,
        name: service.serviceName ?? `Service ${index + 1}`,
        group: 'Services with an active event',
        status: mapAppleStatus(raw),
        statusRaw: raw,
        position: index,
      };
    });

    const incidents: IncidentRecord[] = affected.slice(0, 40).map((service, index) => {
      const event = (service.events ?? [])[0] as AppleEvent;
      const raw = event.statusType ?? event.eventStatus ?? 'issue';
      return {
        externalId: `apple:${service.serviceName ?? index}`,
        kind: 'incident',
        title: `${service.serviceName ?? 'Apple service'}`,
        status: raw,
        statusRaw: raw.toLowerCase(),
        impact: mapAppleStatus(raw),
        startedAt: toIso(event.epochStartDate ?? event.startDate ?? null),
        updatedAt: toIso(event.epochEndDate ?? event.endDate ?? event.epochStartDate ?? null),
        resolvedAt: null,
        description: (event.message ?? event.eventMessage ?? null)?.slice(0, 1200) ?? null,
        url: ctx.service.statusPage,
        components: [],
      };
    });

    const status = affected.length > 0
      ? components.reduce<UnifiedStatus>((worst, component) => {
        const rank: Record<UnifiedStatus, number> = {
          OPERATIONAL: 0, MAINTENANCE: 1, DEGRADED: 2, PARTIAL_OUTAGE: 3, MAJOR_OUTAGE: 4, UNKNOWN: 5,
        };
        return rank[component.status] > rank[worst] ? component.status : worst;
      }, 'OPERATIONAL')
      : 'OPERATIONAL';

    return baseResult(ctx.service, ctx.now(), {
      status,
      statusRaw: affected.length > 0
        ? `${affected.length} of ${services.length} Apple services have an active event`
        : `all ${services.length} Apple services report normal operation`,
      sourceUrl: String(ctx.service.connectorConfig.pageUrl ?? feedUrl),
      components,
      incidents,
      metadata: {
        provider: 'apple-status',
        services: services.length,
        affected: affected.length,
      },
      notes: ['provider=apple-status', `services=${services.length}`, `affected=${affected.length}`],
    });
  },
};
