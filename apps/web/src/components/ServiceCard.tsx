import type { ServiceCard as ServiceCardType } from '../api.ts';
import { displayName, latency, relativeTime, sourceLabel, statusEmoji } from '../lib/format.ts';
import { useI18n } from '../lib/locale.tsx';
import { StatusPill } from './StatusPill.tsx';

export function ServiceCard({ service, onOpen }: { service: ServiceCardType; onOpen: (slug: string) => void }): React.JSX.Element {
  const i18n = useI18n();

  const differs = service.officialStatus !== service.connectivityStatus
    && service.officialStatus !== 'UNKNOWN'
    && service.connectivityStatus !== 'UNKNOWN';

  const limitation = i18n.locale === 'ar'
    ? (service.limitationAr ?? service.limitation)
    : service.limitation;

  return (
    <button type="button" className="service-card" onClick={() => onOpen(service.slug)}>
      <header>
        <span className="service-emoji" aria-hidden="true">{statusEmoji(service.status)}</span>
        <span className="service-name">{displayName(i18n, service.name, service.nameAr)}</span>
        <span className="service-category">{i18n.locale === 'ar' ? service.categoryNameAr : service.category}</span>
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
        <span className="source-tag">{sourceLabel(i18n, service.officialSourceKind)}</span>
        {service.officialStatus === 'UNKNOWN' && <span className="source-tag muted">{i18n.t('card.officialUnknown')}</span>}
        {differs && <span className="source-tag warn">{i18n.t('card.differs')}</span>}
        {service.activeIncidents > 0 && (
          <span className="source-tag critical">{i18n.t('card.incidents', { count: service.activeIncidents })}</span>
        )}
        {service.componentCount > 0 && (
          <span className="source-tag muted">{i18n.t('card.components', { count: service.componentCount })}</span>
        )}
        <span className="checked">{relativeTime(i18n, service.officialCheckedAt ?? service.connectivityCheckedAt)}</span>
      </footer>

      {limitation && <p className="limitation" title={limitation}>{limitation}</p>}
    </button>
  );
}
