import { getConnector } from '../../../../packages/connectors/src/index.ts';
import { assessHealth, fetchResource, latencySummary } from '../../../../packages/core/src/index.ts';
import type { CheckResult, ServiceDefinition, UnifiedStatus } from '../../../../packages/core/src/index.ts';
import type { LocalIncident, LocalServicePayload } from './store.ts';

const LOCAL_THRESHOLDS = {
  degradedAfterFailures: 2,
  downAfterFailures: 4,
  majorOutageLatencyMs: 3000,
  degradedLatencyMs: 1200,
};

function quietLogger(scope: string) {
  const make = (name: string) => ({
    debug: () => undefined,
    info: () => undefined,
    warn: (message: string, fields?: Record<string, unknown>) => console.warn(`[${name}] ${message}`, fields ?? ''),
    error: (message: string, fields?: Record<string, unknown>) => console.warn(`[${name}] ${message}`, fields ?? ''),
    child: (child: string) => make(`${name}:${child}`),
  });
  return make(scope);
}

/**
 * Connectivity checks from the device itself. A browser cannot open raw sockets or send ICMP,
 * so only HTTP(S) latency is measurable locally; the other columns stay empty and are labelled.
 */
async function latencyChecks(service: ServiceDefinition, timeoutMs: number): Promise<CheckResult[]> {
  const targets = service.checkTargets.filter((target) => target.kind === 'https' || target.kind === 'http');
  // The checks of a single service run in parallel: it keeps the first collection fast.
  const results = await Promise.all(targets.map(async (target): Promise<CheckResult | null> => {
    const started = performance.now();
    const response = await fetchResource(target.target, { timeoutMs, retries: 0 });
    const elapsed = Math.round(performance.now() - started);
    // No HTTP response at all means the browser blocked the request (CORS/mixed content) or the
    // device is offline. That is not evidence of an outage, so the check is skipped instead of
    // being counted as a failure (the same rule as an unavailable ICMP probe).
    if (response.status === 0) return null;
    const expected = target.expectStatus ?? [200, 204, 301, 302, 307, 308, 400, 401, 403, 404, 405, 412, 429];
    const ok = response.status > 0 && expected.includes(response.status);
    return {
      kind: target.kind,
      target: target.label ?? target.target,
      ok,
      latencyMs: response.status > 0 ? elapsed : null,
      statusCode: response.status || null,
      error: ok ? null : response.error ?? `HTTP ${response.status}`,
      region: 'device',
      checkedAt: new Date().toISOString(),
      detail: `HTTP ${response.status} in ${elapsed} ms`,
    };
  }));
  return results.filter((check): check is CheckResult => check !== null);
}

export async function collectServiceLocally(service: ServiceDefinition, timeoutMs = 12_000): Promise<LocalServicePayload> {
  const log = quietLogger(service.slug);
  const checkedAt = new Date().toISOString();

  const payload: LocalServicePayload = {
    slug: service.slug,
    officialStatus: 'UNKNOWN',
    officialStatusRaw: null,
    officialSourceKind: service.sourceKind,
    officialSourceUrl: service.statusPage,
    officialCheckedAt: null,
    officialConfidence: service.confidence,
    officialErrorMessage: null,
    connectivityStatus: 'UNKNOWN',
    connectivityCheckedAt: null,
    latency: { http: null, https: null, dns: null, tcp: null, icmp: null },
    components: [],
    incidents: [],
    maintenances: [],
    history: [],
    notes: [],
    error: null,
    latencySource: 'device',
  };

  if (service.comingSoon) return payload;

  try {
    const connector = getConnector(service.connector);
    const result = await connector.fetch({ service, log, timeoutMs, now: () => new Date(), secrets: { riotApiKey: null } });
    payload.officialStatus = result.status;
    payload.officialStatusRaw = result.statusRaw;
    payload.officialSourceUrl = result.sourceUrl ?? service.statusPage;
    payload.officialConfidence = result.confidence;
    payload.officialErrorMessage = result.error;
    payload.components = result.components.map((component) => ({
      externalId: component.externalId,
      name: component.name,
      group: component.group,
      status: component.status,
      statusRaw: component.statusRaw,
      position: component.position,
    }));
    const mine: LocalIncident[] = [];
    const maintenance: LocalIncident[] = [];
    for (const record of result.incidents) {
      const item: LocalIncident = {
        externalId: record.externalId,
        kind: record.kind,
        title: record.title,
        status: record.status,
        statusRaw: record.statusRaw,
        impact: record.impact,
        startedAt: record.startedAt,
        updatedAt: record.updatedAt,
        resolvedAt: record.resolvedAt,
        endsAt: record.endsAt ?? null,
        description: record.description,
        url: record.url,
        components: record.components,
      };
      if (record.kind === 'maintenance') maintenance.push(item);
      else mine.push(item);
    }
    payload.incidents = mine;
    payload.maintenances = maintenance;
    payload.notes = result.notes;
  } catch (failure) {
    payload.error = failure instanceof Error ? failure.message : String(failure);
    payload.notes = [`connector failed: ${payload.error}`];
  }

  payload.officialCheckedAt = checkedAt;

  try {
    const checks = await latencyChecks(service, timeoutMs);
    if (checks.length > 0) {
      const assessment = assessHealth(checks, LOCAL_THRESHOLDS, 'UNKNOWN', { officialStatus: payload.officialStatus as UnifiedStatus });
      payload.connectivityStatus = assessment.status;
      const summary = latencySummary(checks);
      payload.latency = { ...payload.latency, http: summary.http, https: summary.https };
    }
  } catch (failure) {
    payload.notes = [...payload.notes, `latency check failed: ${failure instanceof Error ? failure.message : String(failure)}`];
  }

  payload.connectivityCheckedAt = checkedAt;
  return payload;
}
