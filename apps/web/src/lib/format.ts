import type { UnifiedStatus } from '../api.ts';
import type { I18n } from './locale.tsx';

export const STATUS_CLASS: Record<UnifiedStatus, string> = {
  OPERATIONAL: 'ok',
  DEGRADED: 'warn',
  PARTIAL_OUTAGE: 'critical',
  MAJOR_OUTAGE: 'critical',
  MAINTENANCE: 'info',
  UNKNOWN: 'unknown',
};

export function statusLabel(i18n: I18n, status: UnifiedStatus): string {
  return i18n.t(`status.${status}`);
}

export function relativeTime(i18n: I18n, isoTimestamp: string | null): string {
  if (!isoTimestamp) return i18n.t('common.never');
  const diff = Date.now() - Date.parse(isoTimestamp);
  if (Number.isNaN(diff)) return i18n.t('common.unknown');
  const seconds = Math.max(0, Math.round(diff / 1000));
  if (seconds < 5) return i18n.t('common.justNow');
  if (seconds < 60) return i18n.t('common.secondsAgo', { count: seconds });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return i18n.t('common.minutesAgo', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return i18n.t('common.hoursAgo', { count: hours });
  return i18n.t('common.daysAgo', { count: Math.round(hours / 24) });
}

export function clockTime(i18n: I18n, isoTimestamp: string | null): string {
  if (!isoTimestamp) return '—';
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(i18n.tag, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function latency(value: number | null): string {
  if (value === null || value === undefined) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

export function sourceLabel(i18n: I18n, kind: string): string {
  const key = `source.${kind}`;
  const translated = i18n.t(key);
  return translated === key ? i18n.t('source.none') : translated;
}

export function confidenceLabel(i18n: I18n, confidence: string): string {
  const key = `confidence.${confidence}`;
  const translated = i18n.t(key);
  return translated === key ? confidence : translated;
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

/** Arabic interfaces show the Arabic name when a category or service has one. */
export function displayName(i18n: I18n, english: string, arabic?: string | null): string {
  if (i18n.locale === 'ar' && arabic) return arabic;
  return english;
}
