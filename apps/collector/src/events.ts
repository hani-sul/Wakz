import type { DatabaseSync } from 'node:sqlite';
import { recordEvent } from '../../../packages/db/src/index.ts';
import type { UnifiedStatus } from '../../../packages/core/src/index.ts';

/**
 * Notification/event engine: every meaningful transition becomes an event row.
 * Delivery channels (push/email/Telegram/Discord) intentionally consume these events later.
 */
export function emitStatusTransition(
  db: DatabaseSync,
  serviceSlug: string,
  previous: UnifiedStatus | null,
  next: UnifiedStatus,
  channel: 'official' | 'connectivity',
): boolean {
  if (previous === null || previous === next) return false;
  const message = `${channel} status changed from ${previous} to ${next}`;
  recordEvent(db, serviceSlug, `status_changed:${channel}`, previous, next, message, { channel });
  return true;
}

export function emitIncidentEvent(db: DatabaseSync, serviceSlug: string, count: number): void {
  if (count <= 0) return;
  recordEvent(db, serviceSlug, 'incidents_active', null, null, `${count} active incident(s) reported by the source`, { count });
}
