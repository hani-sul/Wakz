import type { UnifiedStatus } from '../api.ts';

export const STATUS_LABEL: Record<UnifiedStatus, string> = {
  OPERATIONAL: 'Operational',
  DEGRADED: 'Degraded',
  PARTIAL_OUTAGE: 'Partial outage',
  MAJOR_OUTAGE: 'Major outage',
  MAINTENANCE: 'Maintenance',
  UNKNOWN: 'Unknown',
};

export const STATUS_CLASS: Record<UnifiedStatus, string> = {
  OPERATIONAL: 'ok',
  DEGRADED: 'warn',
  PARTIAL_OUTAGE: 'critical',
  MAJOR_OUTAGE: 'critical',
  MAINTENANCE: 'info',
  UNKNOWN: 'unknown',
};

export function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return 'unknown';
  const seconds = Math.max(0, Math.round(diff / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function clockTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function latency(value: number | null): string {
  if (value === null || value === undefined) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

export function sourceLabel(kind: string): string {
  switch (kind) {
    case 'statuspage':
      return 'Statuspage';
    case 'statusio':
      return 'status.io';
    case 'betterstack':
      return 'Better Stack';
    case 'rss':
      return 'Official RSS';
    case 'official-json':
      return 'Official JSON';
    case 'official-api':
      return 'Official API';
    case 'official-page':
      return 'Official page';
    case 'community':
      return 'Community';
    default:
      return 'No source';
  }
}

export function statusEmoji(status: UnifiedStatus): string {
  switch (status) {
    case 'OPERATIONAL':
      return '🟢';
    case 'DEGRADED':
      return '🟡';
    case 'MAINTENANCE':
      return '🔵';
    case 'PARTIAL_OUTAGE':
    case 'MAJOR_OUTAGE':
      return '🔴';
    default:
      return '⚪';
  }
}
