import { fetchResource, mapStatusText, parseFeed, stripHtml, worstStatus } from '../../core/src/index.ts';
import type { ComponentState, Connector, ConnectorContext, ConnectorResult, IncidentRecord, UnifiedStatus } from '../../core/src/index.ts';
import { baseResult, failureResult, toIso } from './types.ts';

const RESOLVED_PATTERN = /(resolved|completed|restored|recovered|已解决|已恢复)/i;
const MAINTENANCE_PATTERN = /(maintenance|maintain|scheduled|维护)/i;

function statusFromText(text: string): UnifiedStatus {
  const explicit = /status\s*:?\s*<?\/?[a-z]*>?\s*(resolved|monitoring|identified|investigating|in progress|scheduled|completed)/i.exec(text);
  if (explicit?.[1]) return mapStatusText(explicit[1]);
  if (RESOLVED_PATTERN.test(text)) return 'OPERATIONAL';
  return mapStatusText(text);
}

export const rssFeedConnector: Connector = {
  id: 'rss-feed',
  label: 'Official RSS/Atom status feed',
  capabilities: { status: true, components: true, incidents: true, maintenance: true, regions: false },
  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const feedUrl = String(ctx.service.connectorConfig.feedUrl ?? '');
    const emptyMeansOperational = Boolean(ctx.service.connectorConfig.emptyMeansOperational);
    if (!feedUrl) return failureResult(ctx.service, ctx.now(), 'connectorConfig.feedUrl missing');

    const response = await fetchResource(feedUrl, { timeoutMs: ctx.timeoutMs, maxBytes: 4_000_000 });
    if (!response.ok || !response.text) {
      return failureResult(ctx.service, ctx.now(), response.error ?? 'feed unavailable', feedUrl);
    }

    const items = parseFeed(response.text);
    if (items.length === 0) {
      return baseResult(ctx.service, ctx.now(), {
        status: emptyMeansOperational ? 'OPERATIONAL' : 'OPERATIONAL',
        statusRaw: 'no active entries in official feed',
        sourceUrl: String(ctx.service.connectorConfig.pageUrl ?? feedUrl),
        metadata: { provider: 'rss', entries: 0, emptyFeed: true },
        notes: ['provider=rss', 'feed contained no entries (treated as no active incident)'],
      });
    }

    const isComponentReport = items.every((item) => /(operational|degraded|outage|maintenance)\s*$/i.test(stripHtml(item.title)));
    const components: ComponentState[] = [];
    const incidents: IncidentRecord[] = [];

    items.forEach((item, index) => {
      const title = stripHtml(item.title);
      const body = stripHtml(item.description);
      const timestamp = toIso(item.pubDate ?? item.updated ?? '') ?? ctx.now().toISOString();
      const resolved = RESOLVED_PATTERN.test(`${title} ${body}`);
      const maintenance = MAINTENANCE_PATTERN.test(`${title} ${body}`);
      const status = statusFromText(`${title} ${body}`);

      if (isComponentReport) {
        const [namePart, statusPart] = title.split(/\s+-\s+/);
        components.push({
          externalId: item.guid ?? `${index}`,
          name: (namePart ?? title).trim(),
          group: null,
          status: mapStatusText(statusPart ?? title),
          statusRaw: (statusPart ?? 'unknown').trim(),
          position: index,
        });
        return;
      }

      incidents.push({
        externalId: item.guid ?? item.link ?? `${index}`,
        kind: maintenance ? 'maintenance' : 'incident',
        title,
        status: maintenance ? (resolved ? 'completed' : 'in progress') : (resolved ? 'resolved' : 'investigating'),
        statusRaw: maintenance ? (resolved ? 'completed' : 'in_progress') : (resolved ? 'resolved' : 'investigating'),
        impact: resolved ? 'OPERATIONAL' : status,
        startedAt: timestamp,
        updatedAt: timestamp,
        resolvedAt: resolved ? timestamp : null,
        description: body.slice(0, 1200) || null,
        url: item.link,
        components: [],
      });
    });

    const activeIncidents = incidents.filter((incident) => incident.kind === 'incident' && incident.resolvedAt === null);
    const activeMaintenance = incidents.filter((incident) => incident.kind === 'maintenance' && incident.resolvedAt === null);

    let status: UnifiedStatus;
    if (components.length > 0) {
      status = worstStatus(components.map((component) => component.status));
    } else if (activeIncidents.length > 0) {
      status = worstStatus(activeIncidents.map((incident) => incident.impact));
    } else if (activeMaintenance.length > 0) {
      status = 'MAINTENANCE';
    } else {
      status = 'OPERATIONAL';
    }

    return baseResult(ctx.service, ctx.now(), {
      status,
      statusRaw: components.length > 0
        ? `worst component status from ${components.length} feed entries`
        : activeIncidents.length > 0
          ? `${activeIncidents.length} active incident(s) in feed`
          : 'no active incidents in feed',
      sourceUrl: String(ctx.service.connectorConfig.pageUrl ?? feedUrl),
      components,
      incidents: incidents.slice(0, 30),
      metadata: {
        provider: 'rss',
        entries: items.length,
        componentReports: components.length,
        activeIncidents: activeIncidents.length,
        activeMaintenance: activeMaintenance.length,
      },
      notes: ['provider=rss', `entries=${items.length}`],
    });
  },
};
