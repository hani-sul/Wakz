import type { UnifiedStatus } from '../api.ts';
import { STATUS_CLASS, statusLabel } from '../lib/format.ts';
import { useI18n } from '../lib/locale.tsx';

export function StatusPill({ status, subtle = false }: { status: UnifiedStatus; subtle?: boolean }): React.JSX.Element {
  const i18n = useI18n();
  return (
    <span className={`pill pill-${STATUS_CLASS[status]}${subtle ? ' pill-subtle' : ''}`}>
      <span className="pill-dot" aria-hidden="true" />
      {statusLabel(i18n, status)}
    </span>
  );
}

export function DualStatus({ official, connectivity }: { official: UnifiedStatus; connectivity: UnifiedStatus }): React.JSX.Element {
  const i18n = useI18n();
  return (
    <div className="dual-status">
      <div>
        <span className="dual-label">{i18n.t('card.officialStatus')}</span>
        <StatusPill status={official} />
      </div>
      <div>
        <span className="dual-label">{i18n.t('card.ourCheck')}</span>
        <StatusPill status={connectivity} subtle />
      </div>
    </div>
  );
}
