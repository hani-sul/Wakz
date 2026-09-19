import { useState } from 'react';
import type { ServiceCard as ServiceCardType } from '../api.ts';
import { displayName, latency, relativeTime, sourceLabel, statusEmoji } from '../lib/format.ts';
import { useI18n } from '../lib/locale.tsx';
import { usePins } from '../lib/pins.ts';
import { StatusPill } from './StatusPill.tsx';

export function ServiceCard({
  service,
  onOpen,
  onPinChanged,
}: {
  service: ServiceCardType;
  onOpen: (slug: string) => void;
  onPinChanged?: () => void;
}): React.JSX.Element {
  const i18n = useI18n();
  const { pinned, toggle } = usePins();
  const [hint, setHint] = useState<string | null>(null);

  if (service.comingSoon) {
    return (
      <div className="service-card coming-soon" role="note">
        <header>
          <span className="service-emoji" aria-hidden="true">✨</span>
          <span className="service-name">{displayName(i18n, service.name, service.nameAr)}</span>
        </header>
        <p className="coming-soon-title">{i18n.t('comingSoon.title')}</p>
        <p className="limitation">{i18n.locale === 'ar' ? (service.limitationAr ?? i18n.t('comingSoon.body')) : (service.limitation ?? i18n.t('comingSoon.body'))}</p>
      </div>
    );
  }

  const differs = service.officialStatus !== service.connectivityStatus
    && service.officialStatus !== 'UNKNOWN'
    && service.connectivityStatus !== 'UNKNOWN';

  const limitation = i18n.locale === 'ar' ? (service.limitationAr ?? service.limitation) : service.limitation;
  const isPinned = pinned(service.slug);

  const handlePin = (): void => {
    const result = toggle(service.slug);
    if (!result.ok && result.reason === 'limit') {
      setHint(i18n.t('pin.full'));
      setTimeout(() => setHint(null), 2500);
    } else {
      setHint(null);
      onPinChanged?.();
    }
  };

  return (
    <article className={`service-card${isPinned ? ' pinned' : ''}`}>
      <header>
        <span className="service-emoji" aria-hidden="true">{statusEmoji(service.status)}</span>
        <button type="button" className="card-title" onClick={() => onOpen(service.slug)}>
          {displayName(i18n, service.name, service.nameAr)}
        </button>
        <button
          type="button"
          className={`pin-button${isPinned ? ' active' : ''}`}
          aria-label={isPinned ? i18n.t('pin.remove') : i18n.t('pin.add')}
          title={isPinned ? i18n.t('pin.remove') : i18n.t('pin.add')}
          onClick={handlePin}
        >
          {isPinned ? '★' : '☆'}
        </button>
      </header>

      <div className="card-status-row">
        <div>
          <span className="dual-label">{i18n.t('card.officialStatus')}</span>
          <StatusPill status={service.officialStatus} />
        </div>
        <div>
          <span className="dual-label">{i18n.t('card.ourCheck')}</span>
          <StatusPill status={service.connectivityStatus} subtle />
        </div>
      </div>

      <dl className="service-metrics">
        <div>
          <dt>{i18n.t('card.latency')}</dt>
          <dd>{latency(service.latency.https ?? service.latency.http ?? service.latency.tcp)}</dd>
        </div>
        <div>
          <dt>{i18n.t('card.dns')}</dt>
          <dd>{latency(service.latency.dns)}</dd>
        </div>
        <div>
          <dt>{i18n.t('card.tcp')}</dt>
          <dd>{latency(service.latency.tcp)}</dd>
        </div>
      </dl>

      <footer>
        <span className="source-tag">{i18n.locale === 'ar' ? (service.categoryNameAr ?? service.category) : service.category}</span>
        <span className="source-tag muted">{sourceLabel(i18n, service.officialSourceKind)}</span>
        {service.officialStatus === 'UNKNOWN' && <span className="source-tag muted">{i18n.t('card.officialUnknown')}</span>}
        {differs && <span className="source-tag warn">{i18n.t('card.differs')}</span>}
        {service.activeIncidents > 0 && (
          <span className="source-tag critical">{i18n.t('card.incidents', { count: service.activeIncidents })}</span>
        )}
        <span className="checked">{relativeTime(i18n, service.officialCheckedAt ?? service.connectivityCheckedAt)}</span>
      </footer>

      {hint && <p className="card-hint">{hint}</p>}
      {limitation && <p className="limitation" title={limitation}>{limitation}</p>}
    </article>
  );
}
