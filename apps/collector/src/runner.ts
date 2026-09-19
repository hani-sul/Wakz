import type { DatabaseSync } from 'node:sqlite';
import {
  SERVICE_BY_SLUG,
  assessHealth,
  createLogger,
  latencySummary,
} from '../../../packages/core/src/index.ts';
import type { AppConfig, ServiceDefinition, UnifiedStatus } from '../../../packages/core/src/index.ts';
import {
  getConnectivityMap,
  getStatusMap,
  listServiceRows,
  recordConnectorRun,
  saveChecks,
  saveConnectivity,
  saveConnectorResult,
} from '../../../packages/db/src/index.ts';
import { getConnector } from '../../../packages/connectors/src/index.ts';
import { runChecks } from './latency.ts';
import { emitIncidentEvent, emitStatusTransition } from './events.ts';

export type RunSummary = {
  slug: string;
  connectorOk: boolean;
  officialStatus: UnifiedStatus;
  connectivityStatus: UnifiedStatus;
  latency: Record<string, number | null>;
  errors: string[];
  durationMs: number;
};

export async function collectService(db: DatabaseSync, service: ServiceDefinition, config: AppConfig): Promise<RunSummary> {
  const log = createLogger(config.logLevel, service.slug);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const errors: string[] = [];
  log.info('check started');

  const connector = getConnector(service.connector);
  let officialStatus: UnifiedStatus = 'UNKNOWN';
  let activeIncidents = 0;

  try {
    const connectorResult = await connector.fetch({
      service,
      log,
      timeoutMs: config.thresholds.checkTimeoutMs,
      now: () => new Date(),
      secrets: { riotApiKey: config.riotApiKey },
    });

    const previousStatus = (getStatusMap(db).get(service.slug)?.status ?? null) as UnifiedStatus | null;
    saveConnectorResult(db, service.slug, connectorResult);
    officialStatus = connectorResult.status;
    activeIncidents = connectorResult.incidents.filter((incident) => incident.resolvedAt === null && incident.kind === 'incident').length;

    if (connectorResult.error) {
      errors.push(connectorResult.error);
      log.warn('connector finished with error', { error: connectorResult.error });
    } else {
      log.info('status collected', {
        status: connectorResult.status,
        raw: connectorResult.statusRaw,
        source: connectorResult.sourceKind,
        components: connectorResult.components.length,
        incidents: connectorResult.incidents.length,
      });
    }
    if (emitStatusTransition(db, service.slug, previousStatus, officialStatus, 'official')) {
      log.info('official status changed', { from: previousStatus, to: officialStatus });
    }
    emitIncidentEvent(db, service.slug, activeIncidents);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    log.error('connector threw', { error: message });
  }

  let connectivityStatus: UnifiedStatus = 'UNKNOWN';
  let latency: Record<string, number | null> = { http: null, https: null, dns: null, tcp: null, icmp: null };

  try {
    const checks = await runChecks(service, {
      region: config.region,
      timeoutMs: config.thresholds.checkTimeoutMs,
      icmpEnabled: config.icmpEnabled,
    });
    saveChecks(db, service.slug, checks);

    const previousConnectivity = (getConnectivityMap(db).get(service.slug)?.status ?? null) as UnifiedStatus | null;
    const assessment = assessHealth(checks, config.thresholds, previousConnectivity ?? 'UNKNOWN');
    connectivityStatus = assessment.status;
    latency = latencySummary(checks);
    saveConnectivity(
      db,
      service.slug,
      connectivityStatus,
      new Date().toISOString(),
      latency,
      assessment.reasons,
      assessment.consecutiveFailures,
      assessment.successRate,
    );

    log.info('latency measured', {
      http: latency.http,
      https: latency.https,
      dns: latency.dns,
      tcp: latency.tcp,
      icmp: latency.icmp,
      status: connectivityStatus,
    });
    for (const check of checks) {
      if (!check.ok) log.warn(`check failed: ${check.kind} ${check.target}`, { error: check.error });
    }
    if (emitStatusTransition(db, service.slug, previousConnectivity, connectivityStatus, 'connectivity')) {
      log.info('connectivity status changed', { from: previousConnectivity, to: connectivityStatus });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    log.error('latency engine failed', { error: message });
  }

  const durationMs = Date.now() - started;
  recordConnectorRun(db, service.slug, startedAt, errors.length === 0, durationMs, errors[0] ?? null, errors);

  return { slug: service.slug, connectorOk: errors.length === 0, officialStatus, connectivityStatus, latency, errors, durationMs };
}

export async function collectAll(db: DatabaseSync, config: AppConfig, only?: string[]): Promise<RunSummary[]> {
  const rows = listServiceRows(db).filter((row) => !only || only.includes(row.slug));
  const summaries: RunSummary[] = [];
  const queue = [...rows];
  const workers = Array.from({ length: Math.max(1, Math.min(config.collectorConcurrency, queue.length)) }, async () => {
    while (queue.length > 0) {
      const row = queue.shift();
      if (!row) break;
      const service = SERVICE_BY_SLUG.get(row.slug);
      if (!service) continue;
      summaries.push(await collectService(db, service, config));
    }
  });
  await Promise.all(workers);
  return summaries;
}
