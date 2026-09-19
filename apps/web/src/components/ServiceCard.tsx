import type { ServiceCard as ServiceCardType } from '../api.ts';
import { clockTime, latency, relativeTime, sourceLabel, statusEmoji } from '../lib/format.ts';
import { StatusPill } from './StatusPill.tsx';

export function ServiceCard({ service, onOpen }: { service: ServiceCardType; onOpen: (slug: string) => void }): React.JSX.Element {
  const degraded = service.officialStatus !== service.connectivityStatus
    && service.officialStatus !== 'UNKNOWN'
    && service.connectivityStatus !== 'UNKNOWN'
    && service.officialStatus === 'OPERATIONAL'
    && service.connectivityStatus !== 'OPERATIONAL';

  return (
    <button type="button" className="service-card" onClick={() => onOpen(service.slug)}>
      <header>
        <span className="service-emoji" aria-hidden="true">{statusEmoji(service.status)}</span>
        <span className="service-name">{service.name}</span>
        <span className="service-category">{service.category}</span>
      </header>

      <div className="card-status-row">
        <div>
          <span className="dual-label">Official status</span>
          <StatusPill status={service.officialStatus} />
        </div>
        <div>
          <span className="dual-label">Our check</span>
          <StatusPill status={service.connectivityStatus} subtle />
        </div>
      </div>

      <dl className="service-metrics">
        <div>
          <dt>Latency</dt>
          <dd>{latency(service.latency.https ?? service.latency.http ?? service.latency.tcp)}</dd>
        </div>
        <div>
          <dt>DNS</dt>
          <dd>{latency(service.latency.dns)}</dd>
        </div>
        <div>
          <dt>TCP</dt>
          <dd>{latency(service.latency.tcp)}</dd>
        </div>
      </dl>

      <footer>
        <span className="source-tag">{sourceLabel(service.officialSourceKind)}</span>
        {service.officialStatus === 'UNKNOWN' && <span className="source-tag muted">official status unknown</span>}
        {degraded && <span className="source-tag warn">official vs our check differ</span>}
        {service.activeIncidents > 0 && <span className="source-tag critical">{service.activeIncidents} incident(s)</span>}
        <span className="checked">{relativeTime(service.officialCheckedAt ?? service.connectivityCheckedAt ?? null)}</span>
      </footer>
      {service.limitation && <p className="limitation" title={service.limitation}>{service.limitation}</p>}
      <span className="sr-only">Last official check {clockTime(service.officialCheckedAt)}</span>
    </button>
  );
}
