import { fetchResource, mapStatuspageIndicator, worstStatus } from '../../core/src/index.ts';
import type { ComponentState, Connector, ConnectorContext, ConnectorResult, IncidentRecord } from '../../core/src/index.ts';
import { baseResult, failureResult, toIso } from './types.ts';

type StatuspageStatus = { status: { indicator: string; description: string } };
type StatuspageComponent = {
  id: string; name: string; status: string; position?: number;
  group?: boolean; group_id?: string | null; components?: StatuspageComponent[];
};
type StatuspageIncident = {
  id: string; name: string; status: string; impact: string; created_at: string; updated_at: string;
  resolved_at: string | null; shortlink?: string; incident_updates?: { body: string; created_at: string }[];
  components?: { id: string; name: string }[];
};
type StatuspageMaintenance = {
  id: string; name: string; status: string; created_at: string; updated_at: string;
  scheduled_for: string | null; scheduled_until: string | null; description?: string | null;
  shortlink?: string; components?: { id: string; name: string }[];
};

export function flattenComponents(list: StatuspageComponent[], parentGroup: string | null = null, position = { value: 0 }): ComponentState[] {
  const out: ComponentState[] = [];
  for (const component of list) {
    const group = component.group ? null : parentGroup;
    if (!component.group) {
      out.push({
        externalId: component.id,
        name: component.name,
        group,
        status: mapStatuspageIndicator(component.status),
        statusRaw: component.status,
        position: component.position ?? position.value++,
      });
    }
    if (component.components && component.components.length > 0) {
      out.push(...flattenComponents(component.components, component.group ? component.name : group, position));
    }
  }
  return out;
}

export const statuspageConnector: Connector = {
  id: 'statuspage',
  label: 'Statuspage (Atlassian)',
  capabilities: { status: true, components: true, incidents: true, maintenance: true, regions: false },
  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const baseUrl = String(ctx.service.connectorConfig.baseUrl ?? '');
    const filter = (ctx.service.connectorConfig.componentFilter as string[] | undefined) ?? null;
    if (!baseUrl) return failureResult(ctx.service, ctx.now(), 'connectorConfig.baseUrl missing');

    const [status, components, incidents, maintenances] = await Promise.all([
      fetchResource<StatuspageStatus>(`${baseUrl}/api/v2/status.json`, { timeoutMs: ctx.timeoutMs }),
      fetchResource<{ components: StatuspageComponent[] }>(`${baseUrl}/api/v2/components.json`, { timeoutMs: ctx.timeoutMs }),
      fetchResource<{ incidents: StatuspageIncident[] }>(`${baseUrl}/api/v2/incidents.json`, { timeoutMs: ctx.timeoutMs }),
      fetchResource<{ scheduled_maintenances: StatuspageMaintenance[] }>(`${baseUrl}/api/v2/scheduled-maintenances.json`, { timeoutMs: ctx.timeoutMs }),
    ]);

    if (!status.ok || !status.data?.status) {
      return failureResult(ctx.service, ctx.now(), status.error ?? 'status endpoint unavailable', `${baseUrl}/api/v2/status.json`);
    }

    const allComponents = components.ok && components.data?.components
      ? flattenComponents(components.data.components)
      : [];
    const usableComponents = allComponents.filter((component) => Boolean(component.name));
    const matchedComponents = filter
      ? usableComponents.filter((component) => filter.some((needle) => String(component.name).toLowerCase().includes(needle.toLowerCase())))
      : usableComponents;

    const componentIds = new Set(matchedComponents.map((component) => component.externalId));
    const incidentsRaw = incidents.data?.incidents ?? [];
    const maintenancesRaw = maintenances.data?.scheduled_maintenances ?? [];

    const toRecord = (item: StatuspageIncident | StatuspageMaintenance, kind: 'incident' | 'maintenance'): IncidentRecord => {
      const detail = kind === 'incident'
        ? (item as StatuspageIncident).incident_updates?.[0]?.body ?? null
        : (item as StatuspageMaintenance).description ?? null;
      const scheduledFor = kind === 'maintenance' ? (item as StatuspageMaintenance).scheduled_for : null;
      const statusRaw = item.status.toLowerCase();
      return {
        externalId: item.id,
        kind,
        title: item.name,
        status: item.status,
        statusRaw,
        impact: kind === 'maintenance' ? 'MAINTENANCE' : mapStatuspageIndicator((item as StatuspageIncident).impact),
        startedAt: toIso(scheduledFor ?? item.created_at),
        updatedAt: toIso(item.updated_at),
        resolvedAt: kind === 'incident' ? toIso((item as StatuspageIncident).resolved_at) : null,
        description: detail ? String(detail).slice(0, 1200) : null,
        url: item.shortlink ?? null,
        components: (item.components ?? []).map((component) => component.name),
      };
    };

    const componentFilterMatcher = (item: StatuspageIncident | StatuspageMaintenance): boolean => {
      if (!filter) return true;
      const names = (item.components ?? []).map((component) => component.name.toLowerCase());
      if (names.some((name) => filter.some((needle) => name.includes(needle.toLowerCase())))) return true;
      const ids = (item.components ?? []).map((component) => component.id);
      return ids.some((id) => componentIds.has(id));
    };

    const incidentsRecords = incidentsRaw.filter(componentFilterMatcher).slice(0, 30).map((item) => toRecord(item, 'incident'));
    const maintenanceRecords = maintenancesRaw.filter(componentFilterMatcher).slice(0, 30).map((item) => toRecord(item, 'maintenance'));

    const activeIncidents = incidentsRecords.filter((incident) => incident.resolvedAt === null && incident.statusRaw !== 'resolved');
    const activeMaintenance = maintenanceRecords.filter((item) => item.statusRaw === 'in_progress' || item.statusRaw === 'scheduled');

    const indicatorStatus = mapStatuspageIndicator(status.data.status.indicator, status.data.status.description);
    const componentStatus = matchedComponents.length > 0 ? worstStatus(matchedComponents.map((component) => component.status)) : 'UNKNOWN';

    let derived: ConnectorResult['status'] = indicatorStatus;
    if (filter && matchedComponents.length > 0) {
      derived = worstStatus([indicatorStatus, componentStatus]);
    }
    if (activeIncidents.length > 0) {
      derived = worstStatus([derived, worstStatus(activeIncidents.map((incident) => incident.impact))]);
    }
    if (activeMaintenance.length > 0 && derived === 'OPERATIONAL') {
      derived = 'MAINTENANCE';
    }

    return baseResult(ctx.service, ctx.now(), {
      status: derived,
      statusRaw: status.data.status.description,
      sourceUrl: ctx.service.statusPage ?? `${baseUrl}/`,
      components: matchedComponents,
      incidents: incidentsRecords,
      metadata: {
        indicator: status.data.status.indicator,
        componentCount: matchedComponents.length,
        activeIncidents: activeIncidents.length,
        scheduledMaintenances: maintenanceRecords.length,
        filterApplied: filter !== null,
      },
      notes: [
        `provider=statuspage`,
        `indicator=${status.data.status.indicator}`,
        ...(components.ok ? [] : [`components unavailable: ${components.error}`]),
        ...(incidents.ok ? [] : [`incidents unavailable: ${incidents.error}`]),
      ],
    });
  },
};

export function pickStatuspageIncidentIds(records: IncidentRecord[]): string[] {
  return records.map((record) => record.externalId);
}
