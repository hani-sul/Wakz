/**
 * TechPulse domain types.
 *
 * Kept deliberately explicit (no enums) because the project runs TypeScript directly
 * through Node's type stripping.
 */
import type { Logger } from './logger.ts';

export const UNIFIED_STATUSES = [
  'OPERATIONAL',
  'DEGRADED',
  'PARTIAL_OUTAGE',
  'MAJOR_OUTAGE',
  'MAINTENANCE',
  'UNKNOWN',
] as const;

export type UnifiedStatus = (typeof UNIFIED_STATUSES)[number];
export type Severity = 'ok' | 'warn' | 'critical' | 'info' | 'unknown';

export const CATEGORY_SLUGS = ['gaming', 'ai', 'cloud', 'social', 'media'] as const;
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export type SourceKind =
  | 'statuspage'
  | 'statusio'
  | 'betterstack'
  | 'rss'
  | 'official-json'
  | 'official-api'
  | 'official-page'
  | 'community'
  | 'none';

export type Confidence = 'high' | 'medium' | 'low';

export type CheckKind = 'http' | 'https' | 'dns' | 'tcp' | 'icmp';

export type CheckTarget = {
  kind: CheckKind;
  /** URL for http/https, hostname for dns/tcp/icmp. */
  target: string;
  /** Optional port for tcp checks. */
  port?: number;
  /** Optional label used in the UI. */
  label?: string;
  /** HTTP status codes treated as healthy. */
  expectStatus?: number[];
};

export type ConnectorId =
  | 'statuspage'
  | 'statusio'
  | 'betterstack'
  | 'rss-feed'
  | 'google-cloud'
  | 'aws-health'
  | 'xbox-status'
  | 'nuvio-status'
  | 'uptime-json'
  | 'steam-api'
  | 'connectivity';

export type ServiceDefinition = {
  slug: string;
  name: string;
  /** Arabic display name when the brand is normally written in Arabic; brands keep their Latin name otherwise. */
  nameAr?: string;
  category: CategorySlug;
  homepage: string;
  statusPage: string | null;
  connector: ConnectorId;
  connectorConfig: Record<string, unknown>;
  sourceKind: SourceKind;
  official: boolean;
  confidence: Confidence;
  pollSeconds?: number;
  checkTargets: CheckTarget[];
  /** Documents why a service has no machine-readable source (rendered in the UI). */
  limitation?: string;
  /** Arabic version of `limitation`, shown by the Arabic interface. */
  limitationAr?: string;
};

export type CategoryDefinition = {
  slug: CategorySlug;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  position: number;
};

export type ComponentState = {
  externalId: string;
  name: string;
  group: string | null;
  status: UnifiedStatus;
  statusRaw: string;
  position: number;
};

export type IncidentRecord = {
  externalId: string;
  kind: 'incident' | 'maintenance';
  title: string;
  status: string;
  statusRaw: string;
  impact: UnifiedStatus;
  startedAt: string | null;
  updatedAt: string | null;
  resolvedAt: string | null;
  description: string | null;
  url: string | null;
  components: string[];
};

export type RegionStatus = {
  region: string;
  status: UnifiedStatus;
  statusRaw: string;
  detail: string | null;
};

export type ConnectorResult = {
  ok: boolean;
  status: UnifiedStatus;
  statusRaw: string | null;
  sourceKind: SourceKind;
  sourceUrl: string | null;
  official: boolean;
  confidence: Confidence;
  checkedAt: string;
  components: ComponentState[];
  incidents: IncidentRecord[];
  regions: RegionStatus[];
  metadata: Record<string, unknown>;
  notes: string[];
  error: string | null;
};

export type CheckResult = {
  kind: CheckKind;
  target: string;
  ok: boolean;
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
  region: string;
  checkedAt: string;
  detail: string | null;
};

export type ServiceSnapshot = {
  service: ServiceDefinition;
  officialStatus: UnifiedStatus;
  officialStatusRaw: string | null;
  officialSourceKind: SourceKind;
  officialSourceUrl: string | null;
  officialCheckedAt: string | null;
  officialConfidence: Confidence;
  officialErrorMessage: string | null;
  connectivityStatus: UnifiedStatus;
  connectivityCheckedAt: string | null;
  components: ComponentState[];
  incidents: IncidentRecord[];
  maintenances: IncidentRecord[];
  latency: {
    http: number | null;
    https: number | null;
    dns: number | null;
    tcp: number | null;
    icmp: number | null;
  };
  history: { checkedAt: string; status: UnifiedStatus; latencyMs: number | null }[];
  limitation?: string;
  limitationAr?: string;
};

export type CategorySnapshot = {
  category: CategoryDefinition;
  status: UnifiedStatus;
  counts: Record<UnifiedStatus, number>;
  services: ServiceSnapshot[];
};

// ---------------------------------------------------------------- connectors

export type ConnectorCapabilities = {
  status: boolean;
  components: boolean;
  incidents: boolean;
  maintenance: boolean;
  regions: boolean;
};

export type ConnectorContext = {
  service: ServiceDefinition;
  log: Logger;
  timeoutMs: number;
  now: () => Date;
  secrets: { riotApiKey: string | null };
};

export type Connector = {
  id: ConnectorId;
  label: string;
  capabilities: ConnectorCapabilities;
  fetch: (ctx: ConnectorContext) => Promise<ConnectorResult>;
};
