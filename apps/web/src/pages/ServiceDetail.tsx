import { useEffect, useState } from 'react';
import type { IncidentRecord, ServiceDetail as Detail } from '../api.ts';
import { data } from '../data.ts';
import { IncidentList } from '../components/IncidentList.tsx';
import { Sparkline } from '../components/Sparkline.tsx';
import { DualStatus, StatusPill } from '../components/StatusPill.tsx';
import { clockTime, confidenceLabel, displayName, latency, relativeTime, sourceLabel } from '../lib/format.ts';
import { useI18n } from '../lib/locale.tsx';
import { usePins } from '../lib/pins.ts';

const RANGES = [
  { hours: 24, key: 'range.24h' },
  { hours: 168, key: 'range.7d' },
  { hours: 720, key: 'range.30d' },
];

function isUpcoming(maintenance: IncidentRecord): boolean {
  if (!maintenance.startedAt) return false;
  return Date.parse(maintenance.startedAt) > Date.now();
}

function isRunning(maintenance: IncidentRecord): boolean {
  if (!maintenance.startedAt) return false;
  const start = Date.parse(maintenance.startedAt);
  const end = maintenance.endsAt ? Date.parse(maintenance.endsAt) : null;
  if (Number.isNaN(start)) return false;
  if (start > Date.now()) return false;
  if (end && !Number.isNaN(end)) return Date.now() <= end;
  return true;
}

export function ServiceDetail({ slug, onChanged }: { slug: string; onChanged?: () => void }): React.JSX.Element {
  const i18n = useI18n();
  const { pinned, toggle } = usePins();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [hours, setHours] = useState(24);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const next = await data.service(slug, hours);
        if (!cancelled) {
          setDetail(next);
          setError(null);
        }
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : String(failure));
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [slug, hours]);

  if (error) return <p className="error-banner">{i18n.t('service.notFound', { slug, error })}</p>;
  if (!detail) return <p className="empty-state">{i18n.t('service.loading')}</p>;

  if (detail.comingSoon) {
    return (
      <div className="page">
        <section className="panel">
          <a className="back-link" href="#/category/local">{i18n.t('category.back')}</a>
          <h1 className="coming-soon-title">{i18n.t('comingSoon.title')}</h1>
          <p className="hero-sub">{i18n.locale === 'ar' ? (detail.limitationAr ?? i18n.t('comingSoon.body')) : (detail.limitation ?? i18n.t('comingSoon.body'))}</p>
        </section>
      </div>
    );
  }

  const limitation = i18n.locale === 'ar' ? (detail.limitationAr ?? detail.limitation) : detail.limitation;
  const isPinned = pinned(detail.slug);

  const groups = new Map<string, typeof detail.components>();
  for (const component of detail.components) {
    const key = component.group ?? i18n.t('service.allComponents');
    groups.set(key, [...(groups.get(key) ?? []), component]);
  }

  const activeIncidents = detail.incidents.filter((incident) => incident.resolvedAt === null);
  const pastIncidents = detail.incidents.filter((incident) => incident.resolvedAt !== null).slice(0, 10);
  const runningMaintenance = detail.maintenances.filter(isRunning);
  const upcomingMaintenance = detail.maintenances
    .filter(isUpcoming)
    .sort((left, right) => Date.parse(left.startedAt ?? '') - Date.parse(right.startedAt ?? ''));
  const finishedMaintenance = detail.maintenances.filter((item) => !isRunning(item) && !isUpcoming(item)).slice(0, 5);

  return (
    <div className="page">
      <section className="service-head">
        <a className="back-link" href="#/">{i18n.t('service.back')}</a>
        <div className="service-head-row">
          <h1>{displayName(i18n, detail.name, detail.nameAr)}</h1>
          <StatusPill status={detail.status} />
          <button
            type="button"
            className={`pin-button wide${isPinned ? ' active' : ''}`}
            onClick={() => {
              toggle(detail.slug);
              onChanged?.();
            }}
          >
            {isPinned ? '★' : '☆'} {isPinned ? i18n.t('pin.remove') : i18n.t('pin.add')}
          </button>
        </div>
        <p className="hero-sub">
          {i18n.locale === 'ar' ? detail.categoryNameAr : detail.category}
          {' · '}
          <a href={detail.homepage} target="_blank" rel="noreferrer noopener">{i18n.t('service.homepage')}</a>
          {detail.statusPage && (
            <>
              {' · '}
              <a href={detail.statusPage} target="_blank" rel="noreferrer noopener">{i18n.t('service.statusPage')}</a>
            </>
          )}
          {' · '}
          <span className="muted">{i18n.t('service.checked', { time: relativeTime(i18n, detail.officialCheckedAt ?? detail.connectivityCheckedAt) })}</span>
        </p>
      </section>

      {(runningMaintenance.length > 0 || upcomingMaintenance.length > 0) && (
        <section className="panel maintenance-panel">
          <h2>{i18n.t('maintenance.upcoming')}</h2>
          <ul className="maintenance-list">
            {[...runningMaintenance, ...upcomingMaintenance].slice(0, 6).map((maintenance) => (
              <li key={`${maintenance.kind}-${maintenance.externalId}`} className={isRunning(maintenance) ? 'running' : ''}>
                <div className="maintenance-head">
                  <span className={`maintenance-badge${isRunning(maintenance) ? ' running' : ''}`}>
                    {isRunning(maintenance) ? i18n.t('maintenance.running') : i18n.t('maintenance.upcoming')}
                  </span>
                  <strong>{maintenance.title}</strong>
                </div>
                <div className="maintenance-times">
                  <span>{i18n.t('maintenance.starts', { time: clockTime(i18n, maintenance.startedAt) })}</span>
                  {maintenance.endsAt && <span>{i18n.t('maintenance.ends', { time: clockTime(i18n, maintenance.endsAt) })}</span>}
                </div>
                {maintenance.url && (
                  <a className="incident-link" href={maintenance.url} target="_blank" rel="noreferrer noopener">
                    {i18n.t('incidents.viewOnPage')}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="detail-grid">
        <article className="panel">
          <h2>{i18n.t('service.statusTitle')}</h2>
          <DualStatus official={detail.officialStatus} connectivity={detail.connectivityStatus} />
          <dl className="kv">
            <div><dt>{i18n.t('service.officialSource')}</dt><dd>{sourceLabel(i18n, detail.officialSourceKind)}</dd></div>
            <div><dt>{i18n.t('service.officialDetail')}</dt><dd>{detail.officialStatusDescription ?? '—'}</dd></div>
            <div><dt>{i18n.t('service.confidence')}</dt><dd>{confidenceLabel(i18n, detail.officialConfidence)}</dd></div>
            <div><dt>{i18n.t('service.officialChecked')}</dt><dd>{clockTime(i18n, detail.officialCheckedAt)}</dd></div>
            <div><dt>{i18n.t('service.connectivityChecked')}</dt><dd>{clockTime(i18n, detail.connectivityCheckedAt)}</dd></div>
          </dl>
          {detail.officialErrorMessage && <p className="error-inline">{i18n.t('service.sourceError', { error: detail.officialErrorMessage })}</p>}
          {limitation && <p className="limitation-block">{limitation}</p>}
        </article>

        <article className="panel">
          <h2>{i18n.t('service.connectivityTitle')}</h2>
          <ul className="latency-list">
            <li><span>{i18n.t('service.https')}</span><strong>{latency(detail.latency.https)}</strong></li>
            <li><span>{i18n.t('service.http')}</span><strong>{latency(detail.latency.http)}</strong></li>
            <li><span>{i18n.t('service.dns')}</span><strong>{latency(detail.latency.dns)}</strong></li>
            <li><span>{i18n.t('service.tcp')}</span><strong>{latency(detail.latency.tcp)}</strong></li>
            <li>
              <span>{i18n.t('service.icmp')}</span>
              <strong>{detail.latency.icmp === null ? i18n.t('latency.notAvailable') : latency(detail.latency.icmp)}</strong>
            </li>
          </ul>
          <p className="note">{i18n.t('service.connectivityNote')}</p>
          <p className="note">{i18n.t('latency.deviceNote')}</p>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>{i18n.t('service.history')}</h2>
          <div className="range-switch">
            {RANGES.map((range) => (
              <button
                key={range.hours}
                type="button"
                className={hours === range.hours ? 'active' : ''}
                onClick={() => setHours(range.hours)}
              >
                {i18n.t(range.key)}
              </button>
            ))}
          </div>
        </div>
        <Sparkline points={detail.history} />
      </section>

      {detail.components.length > 0 && (
        <section className="panel">
          <h2>{i18n.t('service.components')}</h2>
          {[...groups.entries()].map(([group, components]) => (
            <div key={group} className="component-group">
              <h3>{group}</h3>
              <ul className="component-list">
                {components.map((component) => (
                  <li key={component.externalId}>
                    <span className="component-name">{component.name}</span>
                    <StatusPill status={component.status} subtle />
                    <span className="component-raw">{component.statusRaw}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <section className="panel">
        <h2>{i18n.t('service.activeIncidents')}</h2>
        <IncidentList incidents={activeIncidents} emptyLabel={i18n.t('incidents.emptyActive')} />
        <h2 className="panel-subhead">{i18n.t('service.maintenance')}</h2>
        <IncidentList
          incidents={finishedMaintenance}
          emptyLabel={i18n.t('maintenance.none')}
        />
        <h2 className="panel-subhead">{i18n.t('service.pastIncidents')}</h2>
        <IncidentList incidents={pastIncidents} emptyLabel={i18n.t('incidents.emptyPast')} />
      </section>

      <p className="footer-note">
        {detail.officialStatus === detail.connectivityStatus
          ? i18n.t('service.unifiedFooterShort', { official: i18n.t(`status.${detail.officialStatus}`) })
          : i18n.t('service.unifiedFooter', {
            official: i18n.t(`status.${detail.officialStatus}`),
            connectivity: i18n.t(`status.${detail.connectivityStatus}`),
          })}
      </p>
    </div>
  );
}
