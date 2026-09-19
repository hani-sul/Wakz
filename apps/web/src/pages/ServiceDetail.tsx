import { useEffect, useState } from 'react';
import { api, type ServiceDetail as Detail } from '../api.ts';
import { IncidentList } from '../components/IncidentList.tsx';
import { Sparkline } from '../components/Sparkline.tsx';
import { DualStatus, StatusPill } from '../components/StatusPill.tsx';
import { clockTime, confidenceLabel, displayName, latency, relativeTime, sourceLabel } from '../lib/format.ts';
import { useI18n } from '../lib/locale.tsx';

const RANGES = [
  { hours: 24, key: 'range.24h' },
  { hours: 168, key: 'range.7d' },
  { hours: 720, key: 'range.30d' },
];

export function ServiceDetail({ slug }: { slug: string }): React.JSX.Element {
  const i18n = useI18n();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [hours, setHours] = useState(24);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const next = await api.service(slug, hours);
        if (!cancelled) {
          setDetail(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [slug, hours]);

  if (error) return <p className="error-banner">{i18n.t('service.notFound', { slug, error })}</p>;
  if (!detail) return <p className="empty-state">{i18n.t('service.loading')}</p>;

  const limitation = i18n.locale === 'ar' ? (detail.limitationAr ?? detail.limitation) : detail.limitation;

  const groups = new Map<string, typeof detail.components>();
  for (const component of detail.components) {
    const key = component.group ?? '—';
    groups.set(key, [...(groups.get(key) ?? []), component]);
  }

  const activeIncidents = detail.incidents.filter((incident) => incident.resolvedAt === null);
  const pastIncidents = detail.incidents.filter((incident) => incident.resolvedAt !== null).slice(0, 10);

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <a className="back-link" href="#/">{i18n.t('service.back')}</a>
          <h1>{displayName(i18n, detail.name, detail.nameAr)}</h1>
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
          </p>
        </div>
        <div className="hero-status">
          <StatusPill status={detail.status} />
          <span className="hero-meta">{i18n.t('service.checked', { time: relativeTime(i18n, detail.officialCheckedAt ?? detail.connectivityCheckedAt) })}</span>
        </div>
      </section>

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
          {detail.officialErrorMessage && (
            <p className="error-inline">{i18n.t('service.sourceError', { error: detail.officialErrorMessage })}</p>
          )}
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
              <strong>{detail.latency.icmp === null ? i18n.t('service.notMeasured') : latency(detail.latency.icmp)}</strong>
            </li>
          </ul>
          <p className="note">{i18n.t('service.connectivityNote')}</p>
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
        <IncidentList incidents={detail.maintenances} emptyLabel={i18n.t('incidents.emptyMaintenance')} />
        <h2 className="panel-subhead">{i18n.t('service.pastIncidents')}</h2>
        <IncidentList incidents={pastIncidents} emptyLabel={i18n.t('incidents.emptyPast')} />
      </section>

      <section className="panel">
        <h2>{i18n.t('service.collectorRuns')}</h2>
        <ul className="run-list">
          {detail.recentRuns.map((run) => (
            <li key={run.started_at}>
              <span className={run.ok === 1 ? 'run-ok' : 'run-fail'}>{run.ok === 1 ? 'ok' : 'error'}</span>
              <span>{clockTime(i18n, run.started_at)}</span>
              <span>{run.duration_ms ?? 0} ms</span>
              {run.error && <span className="run-error">{run.error}</span>}
            </li>
          ))}
          {detail.recentRuns.length === 0 && <li>{i18n.t('service.noRuns')}</li>}
        </ul>
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
