export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS services (
  slug             TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL,
  homepage         TEXT NOT NULL,
  status_page      TEXT,
  connector        TEXT NOT NULL,
  connector_config TEXT NOT NULL DEFAULT '{}',
  source_kind      TEXT NOT NULL,
  official         INTEGER NOT NULL DEFAULT 0,
  confidence       TEXT NOT NULL DEFAULT 'medium',
  poll_seconds     INTEGER NOT NULL DEFAULT 60,
  check_targets    TEXT NOT NULL DEFAULT '[]',
  limitation       TEXT,
  enabled          INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  service_slug     TEXT NOT NULL REFERENCES services(slug) ON DELETE CASCADE,
  kind             TEXT NOT NULL,
  url              TEXT NOT NULL,
  official         INTEGER NOT NULL DEFAULT 0,
  confidence       TEXT NOT NULL DEFAULT 'medium',
  notes            TEXT,
  last_verified_at TEXT,
  UNIQUE(service_slug, url)
);

CREATE TABLE IF NOT EXISTS service_status (
  service_slug    TEXT PRIMARY KEY REFERENCES services(slug) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'UNKNOWN',
  status_raw      TEXT,
  source_kind     TEXT NOT NULL DEFAULT 'none',
  source_url      TEXT,
  official        INTEGER NOT NULL DEFAULT 0,
  confidence      TEXT NOT NULL DEFAULT 'low',
  checked_at      TEXT,
  error           TEXT,
  notes           TEXT NOT NULL DEFAULT '[]',
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS status_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  service_slug TEXT NOT NULL REFERENCES services(slug) ON DELETE CASCADE,
  status       TEXT NOT NULL,
  status_raw   TEXT,
  source_kind  TEXT NOT NULL,
  latency_ms   INTEGER,
  checked_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_status_history_service_time ON status_history(service_slug, checked_at DESC);

CREATE TABLE IF NOT EXISTS components (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  service_slug TEXT NOT NULL REFERENCES services(slug) ON DELETE CASCADE,
  external_id  TEXT NOT NULL,
  name         TEXT NOT NULL,
  group_name   TEXT,
  status       TEXT NOT NULL,
  status_raw   TEXT NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL,
  UNIQUE(service_slug, external_id)
);

CREATE TABLE IF NOT EXISTS incidents (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  service_slug TEXT NOT NULL REFERENCES services(slug) ON DELETE CASCADE,
  external_id  TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'incident',
  title        TEXT NOT NULL,
  status       TEXT NOT NULL,
  status_raw   TEXT NOT NULL,
  impact       TEXT NOT NULL,
  started_at   TEXT,
  updated_at   TEXT,
  resolved_at  TEXT,
  description  TEXT,
  url          TEXT,
  components   TEXT NOT NULL DEFAULT '[]',
  source_kind  TEXT NOT NULL,
  seen_at      TEXT NOT NULL,
  UNIQUE(service_slug, kind, external_id)
);
CREATE INDEX IF NOT EXISTS idx_incidents_service ON incidents(service_slug, started_at DESC);

CREATE TABLE IF NOT EXISTS connectivity_status (
  service_slug TEXT PRIMARY KEY REFERENCES services(slug) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'UNKNOWN',
  checked_at   TEXT,
  latency      TEXT NOT NULL DEFAULT '{}',
  reasons      TEXT NOT NULL DEFAULT '[]',
  failures     INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS checks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  service_slug TEXT NOT NULL REFERENCES services(slug) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  target       TEXT NOT NULL,
  ok           INTEGER NOT NULL,
  latency_ms   INTEGER,
  status_code  INTEGER,
  error        TEXT,
  region       TEXT NOT NULL DEFAULT 'local',
  detail       TEXT,
  checked_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checks_service_time ON checks(service_slug, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_checks_kind_time ON checks(service_slug, kind, checked_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  service_slug TEXT NOT NULL REFERENCES services(slug) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  from_status  TEXT,
  to_status    TEXT,
  message      TEXT NOT NULL,
  payload      TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(created_at DESC);

CREATE TABLE IF NOT EXISTS connector_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  service_slug TEXT NOT NULL REFERENCES services(slug) ON DELETE CASCADE,
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  ok           INTEGER NOT NULL DEFAULT 0,
  duration_ms  INTEGER,
  error        TEXT,
  notes        TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_runs_service ON connector_runs(service_slug, started_at DESC);

CREATE TABLE IF NOT EXISTS regions (
  probe_id     TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  country_code TEXT,
  kind         TEXT NOT NULL DEFAULT 'central',
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;
