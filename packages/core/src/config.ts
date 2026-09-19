import { readFileSync } from 'node:fs';
import path from 'node:path';

export type AppConfig = {
  apiHost: string;
  apiPort: number;
  webOrigin: string;
  dbPath: string;
  collectorConcurrency: number;
  defaultPollSeconds: number;
  connectivityPollSeconds: number;
  region: string;
  icmpEnabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  thresholds: {
    degradedAfterFailures: number;
    downAfterFailures: number;
    majorOutageLatencyMs: number;
    degradedLatencyMs: number;
    checkTimeoutMs: number;
  };
  adminToken: string | null;
  riotApiKey: string | null;
};

function parseDotEnv(file: string): Record<string, string> {
  const values: Record<string, string> = {};
  try {
    const content = readFileSync(file, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }
  } catch {
    // No .env file — environment variables only.
  }
  return values;
}

function numberOf(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanOf(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

export function loadConfig(rootDir = process.cwd()): AppConfig {
  const dotenv = parseDotEnv(path.join(rootDir, '.env'));
  const read = (key: string): string | undefined => process.env[key] ?? dotenv[key];

  const level = (read('TECHPULSE_LOG_LEVEL') ?? 'info').toLowerCase();
  const logLevel = (['debug', 'info', 'warn', 'error'].includes(level) ? level : 'info') as AppConfig['logLevel'];
  const adminToken = read('TECHPULSE_ADMIN_TOKEN')?.trim();
  const riotApiKey = read('RIOT_API_KEY')?.trim();

  return {
    apiHost: read('TECHPULSE_API_HOST') ?? '127.0.0.1',
    apiPort: numberOf(read('TECHPULSE_API_PORT'), 4310),
    webOrigin: read('TECHPULSE_WEB_ORIGIN') ?? 'http://localhost:4310',
    dbPath: path.resolve(rootDir, read('TECHPULSE_DB_PATH') ?? './data/techpulse.db'),
    collectorConcurrency: numberOf(read('TECHPULSE_COLLECTOR_CONCURRENCY'), 6),
    defaultPollSeconds: numberOf(read('TECHPULSE_DEFAULT_POLL_SECONDS'), 60),
    connectivityPollSeconds: numberOf(read('TECHPULSE_CONNECTIVITY_POLL_SECONDS'), 30),
    region: read('TECHPULSE_COLLECTOR_REGION') ?? 'local',
    icmpEnabled: booleanOf(read('TECHPULSE_ICMP_ENABLED'), false),
    logLevel,
    thresholds: {
      degradedAfterFailures: numberOf(read('TECHPULSE_DEGRADED_AFTER_FAILURES'), 2),
      downAfterFailures: numberOf(read('TECHPULSE_DOWN_AFTER_FAILURES'), 4),
      majorOutageLatencyMs: numberOf(read('TECHPULSE_MAJOR_OUTAGE_LATENCY_MS'), 3000),
      degradedLatencyMs: numberOf(read('TECHPULSE_DEGRADED_LATENCY_MS'), 1200),
      checkTimeoutMs: numberOf(read('TECHPULSE_CHECK_TIMEOUT_MS'), 10000),
    },
    adminToken: adminToken ? adminToken : null,
    riotApiKey: riotApiKey ? riotApiKey : null,
  };
}

/**
 * Sanitised view of the runtime configuration for the admin API — never exposes secrets.
 */
export function collectConfigFromEnv(): Record<string, unknown> {
  const config = loadConfig();
  return {
    api: { host: config.apiHost, port: config.apiPort, webOrigin: config.webOrigin },
    storage: { dbPath: config.dbPath },
    collector: {
      concurrency: config.collectorConcurrency,
      defaultPollSeconds: config.defaultPollSeconds,
      connectivityPollSeconds: config.connectivityPollSeconds,
      region: config.region,
      icmpEnabled: config.icmpEnabled,
    },
    thresholds: config.thresholds,
    logLevel: config.logLevel,
    adminEnabled: config.adminToken !== null,
    riotApiKeyConfigured: config.riotApiKey !== null,
  };
}
