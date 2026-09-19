import type { DatabaseSync } from 'node:sqlite';
import type {
  CategoryDefinition,
  CheckResult,
  ComponentState,
  ConnectorResult,
  IncidentRecord,
  ServiceDefinition,
  UnifiedStatus,
} from '../../core/src/types.ts';
import { nowIso } from './database.ts';

type SqlValue = string | number | null;

export function seedCatalog(db: DatabaseSync, categories: CategoryDefinition[], services: ServiceDefinition[], defaultPollSeconds: number): void {
  const timestamp = nowIso();
  const insertCategory = db.prepare(
    `INSERT INTO categories (slug, name, description, position) VALUES (?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET name = excluded.name, description = excluded.description, position = excluded.position`,
  );
  for (const category of categories) {
    insertCategory.run(category.slug, category.name, category.description, category.position);
  }

  const insertService = db.prepare(
    `INSERT INTO services (slug, name, category, homepage, status_page, connector, connector_config, source_kind,
                           official, confidence, poll_seconds, check_targets, limitation, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       name = excluded.name,
       category = excluded.category,
       homepage = excluded.homepage,
       status_page = excluded.status_page,
       connector = excluded.connector,
       connector_config = excluded.connector_config,
       source_kind = excluded.source_kind,
       official = excluded.official,
       confidence = excluded.confidence,
       poll_seconds = excluded.poll_seconds,
       check_targets = excluded.check_targets,
       limitation = excluded.limitation,
       updated_at = excluded.updated_at`,
  );
  for (const service of services) {
    insertService.run(
      service.slug,
      service.name,
      service.category,
      service.homepage,
      service.statusPage,
      service.connector,
      JSON.stringify(service.connectorConfig),
      service.sourceKind,
      service.official ? 1 : 0,
      service.confidence,
      service.pollSeconds ?? defaultPollSeconds,
      JSON.stringify(service.checkTargets),
      service.limitation ?? null,
      timestamp,
      timestamp,
    );
    ensureStatusRow(db, service.slug, timestamp);
    ensureConnectivityRow(db, service.slug);
  }

  db.prepare(
    `INSERT INTO regions (probe_id, name, country_code, kind, created_at) VALUES ('local', 'Central collector', NULL, 'central', ?)
     ON CONFLICT(probe_id) DO NOTHING`,
  ).run(timestamp);
}

export function ensureStatusRow(db: DatabaseSync, serviceSlug: string, timestamp = nowIso()): void {
  db.prepare(
    `INSERT INTO service_status (service_slug, status, source_kind, official, confidence, updated_at)
     VALUES (?, 'UNKNOWN', 'none', 0, 'low', ?) ON CONFLICT(service_slug) DO NOTHING`,
  ).run(serviceSlug, timestamp);
}

export function ensureConnectivityRow(db: DatabaseSync, serviceSlug: string): void {
  db.prepare(
    `INSERT INTO connectivity_status (service_slug, status) VALUES (?, 'UNKNOWN') ON CONFLICT(service_slug) DO NOTHING`,
  ).run(serviceSlug);
}

export type StatusRow = {
  service_slug: string;
  status: UnifiedStatus;
  status_raw: string | null;
  source_kind: string;
  source_url: string | null;
  official: number;
  confidence: string;
  checked_at: string | null;
  error: string | null;
  notes: string;
  updated_at: string;
};

export function saveConnectorResult(db: DatabaseSync, serviceSlug: string, result: ConnectorResult): StatusRow | null {
  db.prepare(
    `UPDATE service_status SET status = ?, status_raw = ?, source_kind = ?, source_url = ?, official = ?, confidence = ?,
       checked_at = ?, error = ?, notes = ?, updated_at = ?
     WHERE service_slug = ?`,
  ).run(
    result.status,
    result.statusRaw,
    result.sourceKind,
    result.sourceUrl,
    result.official ? 1 : 0,
    result.confidence,
    result.checkedAt,
    result.error,
    JSON.stringify(result.notes),
    nowIso(),
    serviceSlug,
  );

  /**
   * Status history keeps state changes plus a coarse heartbeat (one sample per 30 minutes)
   * so a long stable period still shows up in graphs without one row per poll.
   */
  const lastHistory = db.prepare(
    'SELECT status, checked_at FROM status_history WHERE service_slug = ? ORDER BY checked_at DESC LIMIT 1',
  ).get(serviceSlug) as { status: UnifiedStatus; checked_at: string } | undefined;
  const heartbeatMs = 30 * 60_000;
  const stale = !lastHistory || Date.parse(result.checkedAt) - Date.parse(lastHistory.checked_at) >= heartbeatMs;
  if (!lastHistory || lastHistory.status !== result.status || stale) {
    db.prepare(
      'INSERT INTO status_history (service_slug, status, status_raw, source_kind, checked_at) VALUES (?, ?, ?, ?, ?)',
    ).run(serviceSlug, result.status, result.statusRaw, result.sourceKind, result.checkedAt);
  }

  replaceComponents(db, serviceSlug, result.components);
  saveIncidents(db, serviceSlug, result.incidents, result.sourceKind);

  return db.prepare('SELECT * FROM service_status WHERE service_slug = ?').get(serviceSlug) as StatusRow;
}

export function replaceComponents(db: DatabaseSync, serviceSlug: string, components: ComponentState[]): void {
  if (components.length === 0) return;
  const timestamp = nowIso();
  const statement = db.prepare(
    `INSERT INTO components (service_slug, external_id, name, group_name, status, status_raw, position, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(service_slug, external_id) DO UPDATE SET
       name = excluded.name, group_name = excluded.group_name, status = excluded.status,
       status_raw = excluded.status_raw, position = excluded.position, updated_at = excluded.updated_at`,
  );
  db.exec('BEGIN');
  try {
    const keep = components.map((component) => component.externalId);
    if (keep.length > 0) {
      const placeholders = keep.map(() => '?').join(',');
      db.prepare(`DELETE FROM components WHERE service_slug = ? AND external_id NOT IN (${placeholders})`).run(serviceSlug, ...keep);
    }
    components.forEach((component, index) => {
      statement.run(
        serviceSlug,
        component.externalId,
        component.name,
        component.group,
        component.status,
        component.statusRaw,
        component.position ?? index,
        timestamp,
      );
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function saveIncidents(db: DatabaseSync, serviceSlug: string, incidents: IncidentRecord[], sourceKind: string): void {
  if (incidents.length === 0) return;
  const statement = db.prepare(
    `INSERT INTO incidents (service_slug, external_id, kind, title, status, status_raw, impact, started_at, updated_at,
                            resolved_at, description, url, components, source_kind, seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(service_slug, kind, external_id) DO UPDATE SET
       title = excluded.title, status = excluded.status, status_raw = excluded.status_raw, impact = excluded.impact,
       started_at = excluded.started_at, updated_at = excluded.updated_at, resolved_at = excluded.resolved_at,
       description = excluded.description, url = excluded.url, components = excluded.components,
       source_kind = excluded.source_kind, seen_at = excluded.seen_at`,
  );
  const timestamp = nowIso();
  for (const incident of incidents) {
    statement.run(
      serviceSlug,
      incident.externalId,
      incident.kind,
      incident.title,
      incident.status,
      incident.statusRaw,
      incident.impact,
      incident.startedAt,
      incident.updatedAt,
      incident.resolvedAt,
      incident.description,
      incident.url,
      JSON.stringify(incident.components),
      sourceKind,
      timestamp,
    );
  }
}

export function saveChecks(db: DatabaseSync, serviceSlug: string, checks: CheckResult[]): void {
  if (checks.length === 0) return;
  const statement = db.prepare(
    `INSERT INTO checks (service_slug, kind, target, ok, latency_ms, status_code, error, region, detail, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const check of checks) {
    statement.run(
      serviceSlug,
      check.kind,
      check.target,
      check.ok ? 1 : 0,
      check.latencyMs,
      check.statusCode,
      check.error,
      check.region,
      check.detail,
      check.checkedAt,
    );
  }
}

export function saveConnectivity(
  db: DatabaseSync,
  serviceSlug: string,
  status: UnifiedStatus,
  checkedAt: string,
  latency: Record<string, number | null>,
  reasons: string[],
  failures: number,
  successRate: number,
): void {
  db.prepare(
    `INSERT INTO connectivity_status (service_slug, status, checked_at, latency, reasons, failures, success_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(service_slug) DO UPDATE SET
       status = excluded.status, checked_at = excluded.checked_at, latency = excluded.latency,
       reasons = excluded.reasons, failures = excluded.failures, success_rate = excluded.success_rate`,
  ).run(serviceSlug, status, checkedAt, JSON.stringify(latency), JSON.stringify(reasons), failures, successRate);
}

export function recordEvent(
  db: DatabaseSync,
  serviceSlug: string,
  type: string,
  fromStatus: UnifiedStatus | null,
  toStatus: UnifiedStatus | null,
  message: string,
  payload: Record<string, unknown> = {},
): void {
  db.prepare(
    'INSERT INTO events (service_slug, type, from_status, to_status, message, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(serviceSlug, type, fromStatus, toStatus, message, JSON.stringify(payload), nowIso());
}

export function recordConnectorRun(
  db: DatabaseSync,
  serviceSlug: string,
  startedAt: string,
  ok: boolean,
  durationMs: number,
  error: string | null,
  notes: string[],
): void {
  db.prepare(
    `INSERT INTO connector_runs (service_slug, started_at, finished_at, ok, duration_ms, error, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(serviceSlug, startedAt, nowIso(), ok ? 1 : 0, durationMs, error, JSON.stringify(notes));
}

export function pruneOldData(db: DatabaseSync, days: { checks: number; history: number; runs: number }): void {
  const cut = (daysAgo: number): string => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  db.prepare('DELETE FROM checks WHERE checked_at < ?').run(cut(days.checks));
  db.prepare('DELETE FROM status_history WHERE checked_at < ?').run(cut(days.history));
  db.prepare('DELETE FROM connector_runs WHERE started_at < ?').run(cut(days.runs));
}

export type ServiceRow = {
  slug: string;
  name: string;
  category: string;
  homepage: string;
  status_page: string | null;
  connector: string;
  connector_config: string;
  source_kind: string;
  official: number;
  confidence: string;
  poll_seconds: number;
  check_targets: string;
  limitation: string | null;
  enabled: number;
};

export function listServiceRows(db: DatabaseSync, category?: string): ServiceRow[] {
  if (category) {
    return db.prepare('SELECT * FROM services WHERE enabled = 1 AND category = ? ORDER BY name').all(category) as ServiceRow[];
  }
  return db.prepare('SELECT * FROM services WHERE enabled = 1 ORDER BY name').all() as ServiceRow[];
}

export function getServiceRow(db: DatabaseSync, slug: string): ServiceRow | null {
  const row = db.prepare('SELECT * FROM services WHERE slug = ?').get(slug) as ServiceRow | undefined;
  return row ?? null;
}

export function listCategories(db: DatabaseSync): { slug: string; name: string; description: string; position: number }[] {
  return db.prepare('SELECT slug, name, description, position FROM categories ORDER BY position').all() as {
    slug: string; name: string; description: string; position: number;
  }[];
}

export function getStatusMap(db: DatabaseSync): Map<string, {
  status: UnifiedStatus;
  status_raw: string | null;
  source_kind: string;
  source_url: string | null;
  official: number;
  confidence: string;
  checked_at: string | null;
  error: string | null;
  notes: string;
}> {
  const rows = db.prepare('SELECT * FROM service_status').all() as {
    service_slug: string;
    status: UnifiedStatus;
    status_raw: string | null;
    source_kind: string;
    source_url: string | null;
    official: number;
    confidence: string;
    checked_at: string | null;
    error: string | null;
    notes: string;
  }[];
  return new Map(rows.map((row) => [row.service_slug, row]));
}

export function getConnectivityMap(db: DatabaseSync): Map<string, {
  status: UnifiedStatus;
  checked_at: string | null;
  latency: string;
  reasons: string;
  failures: number;
  success_rate: number;
}> {
  const rows = db.prepare('SELECT * FROM connectivity_status').all() as {
    service_slug: string;
    status: UnifiedStatus;
    checked_at: string | null;
    latency: string;
    reasons: string;
    failures: number;
    success_rate: number;
  }[];
  return new Map(rows.map((row) => [row.service_slug, row]));
}

export function getComponents(db: DatabaseSync, serviceSlug: string): ComponentState[] {
  const rows = db.prepare(
    'SELECT external_id, name, group_name, status, status_raw, position FROM components WHERE service_slug = ? ORDER BY position, name',
  ).all(serviceSlug) as { external_id: string; name: string; group_name: string | null; status: UnifiedStatus; status_raw: string; position: number }[];
  return rows.map((row) => ({
    externalId: row.external_id,
    name: row.name,
    group: row.group_name,
    status: row.status,
    statusRaw: row.status_raw,
    position: row.position,
  }));
}

export function getIncidents(db: DatabaseSync, serviceSlug: string, kind: 'incident' | 'maintenance', limit = 20): IncidentRecord[] {
  const rows = db.prepare(
    `SELECT external_id, kind, title, status, status_raw, impact, started_at, updated_at, resolved_at, description, url, components
     FROM incidents WHERE service_slug = ? AND kind = ?
     ORDER BY COALESCE(updated_at, started_at, seen_at) DESC LIMIT ?`,
  ).all(serviceSlug, kind, limit) as {
    external_id: string; kind: 'incident' | 'maintenance'; title: string; status: string; status_raw: string; impact: UnifiedStatus;
    started_at: string | null; updated_at: string | null; resolved_at: string | null; description: string | null;
    url: string | null; components: string;
  }[];
  return rows.map((row) => ({
    externalId: row.external_id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    statusRaw: row.status_raw,
    impact: row.impact,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    description: row.description,
    url: row.url,
    components: safeJson<string[]>(row.components, []),
  }));
}

export function getStatusHistory(db: DatabaseSync, serviceSlug: string, hours: number): { checkedAt: string; status: UnifiedStatus; latencyMs: number | null }[] {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const rows = db.prepare(
    `SELECT checked_at, status, latency_ms FROM status_history WHERE service_slug = ? AND checked_at >= ? ORDER BY checked_at ASC`,
  ).all(serviceSlug, since) as { checked_at: string; status: UnifiedStatus; latency_ms: number | null }[];
  return rows.map((row) => ({ checkedAt: row.checked_at, status: row.status, latencyMs: row.latency_ms }));
}

export function getRecentChecks(db: DatabaseSync, serviceSlug: string, limit = 40): CheckResult[] {
  const rows = db.prepare(
    `SELECT kind, target, ok, latency_ms, status_code, error, region, detail, checked_at FROM checks
     WHERE service_slug = ? ORDER BY checked_at DESC LIMIT ?`,
  ).all(serviceSlug, limit) as {
    kind: CheckResult['kind']; target: string; ok: number; latency_ms: number | null; status_code: number | null;
    error: string | null; region: string; detail: string | null; checked_at: string;
  }[];
  return rows.map((row) => ({
    kind: row.kind,
    target: row.target,
    ok: row.ok === 1,
    latencyMs: row.latency_ms,
    statusCode: row.status_code,
    error: row.error,
    region: row.region,
    checkedAt: row.checked_at,
    detail: row.detail,
  }));
}

export function getLatencyHistory(db: DatabaseSync, serviceSlug: string, kind: CheckResult['kind'], hours: number): { checkedAt: string; latencyMs: number | null }[] {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const rows = db.prepare(
    `SELECT checked_at, latency_ms FROM checks WHERE service_slug = ? AND kind = ? AND checked_at >= ? AND ok = 1
     ORDER BY checked_at ASC`,
  ).all(serviceSlug, kind, since) as { checked_at: string; latency_ms: number | null }[];
  return rows.map((row) => ({ checkedAt: row.checked_at, latencyMs: row.latency_ms }));
}

export function getRecentEvents(db: DatabaseSync, limit = 50): {
  service_slug: string; type: string; from_status: string | null; to_status: string | null; message: string; created_at: string;
}[] {
  return db.prepare(
    'SELECT service_slug, type, from_status, to_status, message, created_at FROM events ORDER BY created_at DESC LIMIT ?',
  ).all(limit) as { service_slug: string; type: string; from_status: string | null; to_status: string | null; message: string; created_at: string }[];
}

export function getConnectorRuns(db: DatabaseSync, serviceSlug: string | null, limit = 20): {
  service_slug: string; started_at: string; finished_at: string | null; ok: number; duration_ms: number | null; error: string | null; notes: string;
}[] {
  if (serviceSlug) {
    return db.prepare('SELECT * FROM connector_runs WHERE service_slug = ? ORDER BY started_at DESC LIMIT ?').all(serviceSlug, limit) as never;
  }
  return db.prepare('SELECT * FROM connector_runs ORDER BY started_at DESC LIMIT ?').all(limit) as never;
}

export function getActiveIncidents(db: DatabaseSync, limit = 50): (IncidentRecord & { serviceSlug: string })[] {
  const rows = db.prepare(
    `SELECT service_slug, external_id, kind, title, status, status_raw, impact, started_at, updated_at, resolved_at,
            description, url, components
     FROM incidents WHERE resolved_at IS NULL AND status_raw NOT IN ('resolved', 'completed')
     ORDER BY COALESCE(updated_at, started_at, seen_at) DESC LIMIT ?`,
  ).all(limit) as {
    service_slug: string; external_id: string; kind: 'incident' | 'maintenance'; title: string; status: string; status_raw: string;
    impact: UnifiedStatus; started_at: string | null; updated_at: string | null; resolved_at: string | null;
    description: string | null; url: string | null; components: string;
  }[];
  return rows.map((row) => ({
    serviceSlug: row.service_slug,
    externalId: row.external_id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    statusRaw: row.status_raw,
    impact: row.impact,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    description: row.description,
    url: row.url,
    components: safeJson<string[]>(row.components, []),
  }));
}

export function searchCatalog(db: DatabaseSync, query: string, limit = 20): {
  slug: string; name: string; category: string; matchedOn: string; detail: string | null;
}[] {
  const like = `%${query.toLowerCase()}%`;
  const services = db.prepare(
    `SELECT slug, name, category FROM services WHERE enabled = 1
     AND (lower(name) LIKE ? OR lower(slug) LIKE ?) ORDER BY name LIMIT ?`,
  ).all(like, like, limit) as { slug: string; name: string; category: string }[];
  const results = services.map((row) => ({ slug: row.slug, name: row.name, category: row.category, matchedOn: 'service', detail: null as string | null }));

  const components = db.prepare(
    `SELECT c.service_slug AS slug, s.name AS service_name, s.category AS category, c.name AS component_name
     FROM components c JOIN services s ON s.slug = c.service_slug
     WHERE lower(c.name) LIKE ? OR lower(c.group_name) LIKE ? LIMIT ?`,
  ).all(like, like, limit) as { slug: string; service_name: string; category: string; component_name: string }[];
  for (const row of components) {
    results.push({ slug: row.slug, name: row.service_name, category: row.category, matchedOn: 'component', detail: row.component_name });
  }

  const categories = db.prepare('SELECT slug, name FROM categories WHERE lower(name) LIKE ? OR lower(slug) LIKE ?')
    .all(like, like) as { slug: string; name: string }[];
  for (const row of categories) {
    results.push({ slug: `category:${row.slug}`, name: row.name, category: row.slug, matchedOn: 'category', detail: null });
  }

  return results.slice(0, limit);
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, nowIso());
}

export function getSetting(db: DatabaseSync, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function countRows(db: DatabaseSync): Record<string, number> {
  const tables = ['services', 'categories', 'sources', 'service_status', 'status_history', 'components', 'incidents', 'checks', 'events', 'connector_runs', 'regions'];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
    counts[table] = row.c;
  }
  return counts;
}

export function deleteService(db: DatabaseSync, slug: string): void {
  db.prepare('DELETE FROM services WHERE slug = ?').run(slug);
}

export function setServiceEnabled(db: DatabaseSync, slug: string, enabled: boolean): void {
  db.prepare('UPDATE services SET enabled = ?, updated_at = ? WHERE slug = ?').run(enabled ? 1 : 0, nowIso(), slug);
}

export function insertService(db: DatabaseSync, service: ServiceDefinition, defaultPollSeconds: number): void {
  const timestamp = nowIso();
  db.prepare(
    `INSERT INTO services (slug, name, category, homepage, status_page, connector, connector_config, source_kind, official,
                           confidence, poll_seconds, check_targets, limitation, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    service.slug,
    service.name,
    service.category,
    service.homepage,
    service.statusPage,
    service.connector,
    JSON.stringify(service.connectorConfig),
    service.sourceKind,
    service.official ? 1 : 0,
    service.confidence,
    service.pollSeconds ?? defaultPollSeconds,
    JSON.stringify(service.checkTargets),
    service.limitation ?? null,
    timestamp,
    timestamp,
  );
  ensureStatusRow(db, service.slug, timestamp);
  ensureConnectivityRow(db, service.slug);
}
