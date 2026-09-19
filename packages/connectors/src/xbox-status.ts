import { asArray, fetchResource, parseXml, textOf, worstStatus } from '../../core/src/index.ts';
import type { ComponentState, Connector, ConnectorContext, ConnectorResult, UnifiedStatus, XmlNode } from '../../core/src/index.ts';
import { baseResult, failureResult } from './types.ts';

function xboxStateToStatus(state: string | null): UnifiedStatus {
  const value = (state ?? '').toLowerCase();
  if (!value || value === 'none') return 'OPERATIONAL';
  if (value.includes('outage') || value.includes('down') || value.includes('critical')) return 'MAJOR_OUTAGE';
  if (value.includes('impact') || value.includes('partial')) return 'PARTIAL_OUTAGE';
  if (value.includes('warning') || value.includes('degraded') || value.includes('maintenance')) return 'DEGRADED';
  return 'UNKNOWN';
}

function categoriesFrom(node: unknown, group: string): ComponentState[] {
  if (!node || typeof node !== 'object') return [];
  const categoryList = asArray((node as XmlNode).Category);
  return categoryList.map((category, index) => {
    const record = category as XmlNode;
    const statusNode = record.Status as XmlNode | undefined;
    const rawStatus = textOf(statusNode?.Name ?? statusNode?.State) ?? 'Unknown';
    const scenarioCount = asArray((record.Scenarios as XmlNode | undefined)?.Scenario).length;
    return {
      externalId: `${group}:${textOf(record.Id) ?? index}`,
      name: textOf(record.Name) ?? `Category ${index + 1}`,
      group,
      status: xboxStateToStatus(rawStatus),
      statusRaw: scenarioCount > 0 ? `${rawStatus} (${scenarioCount} scenarios)` : rawStatus,
      position: index,
    };
  });
}

type XboxJsonCategory = {
  Id: number;
  Name: string;
  Status?: { Name?: string; Id?: number };
  Scenarios?: { Id: number; Name: string; Status?: { Name?: string }; Devices?: { Id: number; Name: string }[]; Description?: string }[];
};

type XboxJsonPayload = {
  Status?: { Overall?: { State?: string; LastUpdated?: string }; SelectedScenarios?: { State?: string } };
  CoreServices?: XboxJsonCategory[];
  Titles?: XboxJsonCategory[];
};

function categoryToComponent(category: XboxJsonCategory, group: string, index: number): ComponentState {
  const rawStatus = category.Status?.Name ?? 'Unknown';
  const scenarios = category.Scenarios ?? [];
  const affected = scenarios.filter((scenario) => xboxStateToStatus(scenario.Status?.Name ?? 'None') !== 'OPERATIONAL');
  return {
    externalId: `${group}:${category.Id}`,
    name: category.Name,
    group,
    status: xboxStateToStatus(rawStatus),
    statusRaw: affected.length > 0
      ? `${rawStatus} (${affected.length}/${scenarios.length} scenarios affected)`
      : rawStatus,
    position: index,
  };
}

export const xboxStatusConnector: Connector = {
  id: 'xbox-status',
  label: 'Xbox Live service status (xnotify)',
  capabilities: { status: true, components: true, incidents: true, maintenance: false, regions: true },
  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const market = String(ctx.service.connectorConfig.market ?? 'US');
    const locale = String(ctx.service.connectorConfig.locale ?? 'en-US');
    const base = `https://xnotify.xboxlive.com/servicestatusv6/${market}/${locale}`;

    const response = await fetchResource(base, { timeoutMs: ctx.timeoutMs, maxBytes: 4_000_000 });
    if (!response.ok || !response.text) {
      return failureResult(ctx.service, ctx.now(), response.error ?? 'xnotify unavailable', base);
    }

    // xnotify answers with JSON when an Accept header is sent and with XML otherwise.
    // Both representations are handled; the JSON one is what the collector requests.
    const json = response.data as XboxJsonPayload | null;
    if (json && json.Status) {
      const overall = json.Status.Overall?.State ?? json.Status.SelectedScenarios?.State ?? 'Unknown';
      const lastUpdated = json.Status.Overall?.LastUpdated ?? null;
      const categories = [
        ...(json.CoreServices ?? []).map((category, index) => categoryToComponent(category, 'Core services', index)),
        ...(json.Titles ?? []).map((title, index) => categoryToComponent(title, 'Games & apps', index)),
      ];

      const affectedScenarios = [...(json.CoreServices ?? []), ...(json.Titles ?? [])]
        .flatMap((category) => (category.Scenarios ?? [])
          .filter((scenario) => xboxStateToStatus(scenario.Status?.Name ?? 'None') !== 'OPERATIONAL')
          .map((scenario) => ({ category: category.Name, scenario })));

      const worstComponent = categories.length > 0 ? worstStatus(categories.map((component) => component.status)) : 'UNKNOWN';
      const incidents = affectedScenarios.map(({ category, scenario }) => {
        const state = scenario.Status?.Name ?? 'Unknown';
        return {
          externalId: `scenario:${scenario.Id}`,
          kind: 'incident' as const,
          title: `${category} - ${scenario.Name}`,
          status: state,
          statusRaw: state.toLowerCase(),
          impact: xboxStateToStatus(state),
          startedAt: lastUpdated ? new Date(lastUpdated).toISOString() : null,
          updatedAt: lastUpdated ? new Date(lastUpdated).toISOString() : null,
          resolvedAt: null,
          description: scenario.Description ?? null,
          url: ctx.service.statusPage,
          components: (scenario.Devices ?? []).map((device) => device.Name),
        };
      });

      return baseResult(ctx.service, ctx.now(), {
        status: worstStatus([xboxStateToStatus(overall), worstComponent, ...incidents.map((incident) => incident.impact)]),
        statusRaw: overall,
        sourceUrl: ctx.service.statusPage ?? base,
        components: categories,
        incidents,
        regions: [{ region: market, status: xboxStateToStatus(overall), statusRaw: overall, detail: `locale ${locale}` }],
        metadata: {
          provider: 'xnotify',
          representation: 'json',
          endpoint: base,
          lastUpdated,
          categoryCount: categories.length,
          affectedScenarios: affectedScenarios.length,
        },
        notes: ['provider=xnotify (official Xbox Live service status, JSON representation)'],
      });
    }

    let document: XmlNode;
    try {
      document = parseXml(response.text);
    } catch (error) {
      return failureResult(ctx.service, ctx.now(), `unparsable xnotify payload: ${String(error)}`, base);
    }

    const serviceStatus = (document.ServiceStatus ?? {}) as XmlNode;
    const overallNode = (serviceStatus.Status as XmlNode | undefined)?.Overall as XmlNode | undefined;
    const overallState = textOf(overallNode?.State) ?? textOf((serviceStatus.Status as XmlNode | undefined)?.State) ?? 'Unknown';
    const lastUpdated = textOf(overallNode?.LastUpdated);

    const components: ComponentState[] = [
      ...categoriesFrom(serviceStatus.CoreServices, 'Core services'),
      ...categoriesFrom(serviceStatus.Apps, 'Apps'),
      ...categoriesFrom(serviceStatus.Games, 'Games'),
    ];

    const websiteNode = serviceStatus.Website as XmlNode | undefined;
    if (websiteNode) {
      const rawStatus = textOf((websiteNode.Status as XmlNode | undefined)?.Name) ?? 'Unknown';
      components.push({
        externalId: 'website',
        name: textOf(websiteNode.Name) ?? 'Website',
        group: 'Website',
        status: xboxStateToStatus(rawStatus),
        statusRaw: rawStatus,
        position: components.length,
      });
    }

    const scenarios = asArray((serviceStatus.CoreServices as XmlNode | undefined)?.Category)
      .flatMap((category) => asArray((category as XmlNode).Scenarios as XmlNode | undefined)
        .flatMap((scenariosNode) => asArray((scenariosNode as XmlNode).Scenario)));
    const affectedScenarios = scenarios.filter((scenario) => {
      const record = scenario as XmlNode;
      const state = textOf((record.Status as XmlNode | undefined)?.Name) ?? 'None';
      return xboxStateToStatus(state) !== 'OPERATIONAL';
    });

    const incidents = affectedScenarios.map((scenario, index) => {
      const record = scenario as XmlNode;
      const state = textOf((record.Status as XmlNode | undefined)?.Name) ?? 'Unknown';
      return {
        externalId: `scenario:${textOf(record.Id) ?? index}`,
        kind: 'incident' as const,
        title: textOf(record.Name) ?? `Scenario ${index + 1}`,
        status: state,
        statusRaw: state.toLowerCase(),
        impact: xboxStateToStatus(state),
        startedAt: lastUpdated ? new Date(lastUpdated).toISOString() : null,
        updatedAt: lastUpdated ? new Date(lastUpdated).toISOString() : null,
        resolvedAt: null,
        description: textOf(record.Description),
        url: ctx.service.statusPage,
        components: asArray((record.Devices as XmlNode | undefined)?.Device).map((device) => textOf((device as XmlNode).Name) ?? 'Device'),
      };
    });

    const worstComponent = components.length > 0 ? worstStatus(components.map((component) => component.status)) : 'UNKNOWN';
    const status = worstStatus([xboxStateToStatus(overallState), worstComponent, ...incidents.map((incident) => incident.impact)]);

    return baseResult(ctx.service, ctx.now(), {
      status,
      statusRaw: overallState,
      sourceUrl: ctx.service.statusPage ?? base,
      components,
      incidents,
      regions: [{ region: market, status, statusRaw: overallState, detail: `locale ${locale}` }],
      metadata: {
        provider: 'xnotify',
        representation: 'xml',
        endpoint: base,
        lastUpdated,
        categoryCount: components.length,
        scenarioCount: scenarios.length,
        affectedScenarios: affectedScenarios.length,
      },
      notes: ['provider=xnotify (official Xbox Live service status)'],
    });
  },
};
