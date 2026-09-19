import { useEffect, useState } from 'react';
import { api, type ServiceDetail as Detail } from '../api.ts';
import { IncidentList } from '../components/IncidentList.tsx';
import { Sparkline } from '../components/Sparkline.tsx';
import { DualStatus, StatusPill } from '../components/StatusPill.tsx';
import { STATUS_LABEL, clockTime, latency, relativeTime, sourceLabel } from '../lib/format.ts';

const RANGES = [
  { hours: 24, label: '24h' },
  { hours: 168, label: '7d' },
  { hours: 720, label: '30d' },
];

export function ServiceDetail({ slug }: { slug: string }): React.JSX.Element {
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

  if (error) return <p className="error-banner">Could not load {slug}: {error}</p>;
  if (!detail) return <p className="empty-state">Loading service…</p>;

  const groups = new Map<string, typeof detail.components>();
  for (const component of detail.components) {
    const key = component.group ?? 'Components';
    groups.set(key, [...(groups.get(key) ?? []), component]);
  }

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <a className="back-link" href="#/">← All services</a>
          <h1>{detail.name}</h1>
          <p className="hero-sub">
            {detail.category} ·{' '}
            <a href={detail.homepage} target="_blank" rel="noreferrer noopener">homepage</a>
            {detail.statusPage && (
              <>
                {' · '}
                <a href={detail.statusPage} target="_blank" rel="noreferrer noopener">official status page</a>
              </>
            )}
          </p>
        </div>
        <div className="hero-status">
          <StatusPill status={detail.status} />
          <span className="hero-meta">checked {relativeTime(detail.officialCheckedAt ?? detail.connectivityCheckedAt)}</span>
        </div>
      </section>

      <section className="detail-grid">
        <article className="panel">
          <h2>Status</h2>
          <DualStatus official={detail.officialStatus} connectivity={detail.connectivityStatus} />
          <dl className="kv">
            <div><dt>Official source</dt><dd>{sourceLabel(detail.officialSourceKind)}</dd></div>
            <div><dt>Official detail</dt><dd>{detail.officialStatusDescription ?? '—'}</dd></div>
            <div><dt>Confidence</dt><dd>{detail.officialConfidence}</dd></div>
            <div><dt>Official checked</dt><dd>{clockTime(detail.officialCheckedAt)}</dd></div>
            <div><dt>Connectivity checked</dt><dd>{clockTime(detail.connectivityCheckedAt)}</dd></div>
          </dl>
          {detail.officialErrorMessage && (
            <p className="error-inline">Source error: {detail.officialErrorMessage}</p>
          )}
          {detail.limitation && <p className="limitation-block">{detail.limitation}</p>}
        </article>

        <article className="panel">
          <h2>Connectivity (our checks)</h2>
          <ul className="latency-list">
            <li><span>HTTPS</span><strong>{latency(detail.latency.https)}</strong></li>
            <li><span>HTTP</span><strong>{latency(detail.latency.http)}</strong></li>
            <li><span>DNS</span><strong>{latency(detail.latency.dns)}</strong></li>
            <li><span>TCP</span><strong>{latency(detail.latency.tcp)}</strong></li>
            <li><span>ICMP ping</span><strong>{detail.latency.icmp === null ? 'not measured' : latency(detail.latency.icmp)}</strong></li>
          </ul>
          <p className="note">
            These numbers are measured from a single central collector, not from global probes, and they never
            override the vendor's official status.
          </p>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>History</h2>
          <div className="range-switch">
            {RANGES.map((range) => (
              <button
                key={range.hours}
                type="button"
                className={hours === range.hours ? 'active' : ''}
                onClick={() => setHours(range.hours)}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
        <Sparkline points={detail.history} />
      </section>

      {detail.components.length > 0 && (
        <section className="panel">
          <h2>Components</h2>
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
        <h2>Active incidents</h2>
        <IncidentList
          incidents={detail.incidents.filter((incident) => incident.resolvedAt === null)}
          emptyLabel="No active incidents reported by this source."
        />
        <h2 className="panel-subhead">Maintenance</h2>
        <IncidentList incidents={detail.maintenances} emptyLabel="No scheduled maintenance in the source feed." />
        <h2 className="panel-subhead">Past incidents</h2>
        <IncidentList
          incidents={detail.incidents.filter((incident) => incident.resolvedAt !== null).slice(0, 10)}
          emptyLabel="No past incidents stored yet."
        />
      </section>

      <section className="panel">
        <h2>Collector runs</h2>
        <ul className="run-list">
          {detail.recentRuns.map((run) => (
            <li key={run.started_at}>
              <span className={run.ok === 1 ? 'run-ok' : 'run-fail'}>{run.ok === 1 ? 'ok' : 'error'}</span>
              <span>{clockTime(run.started_at)}</span>
              <span>{run.duration_ms ?? 0} ms</span>
              {run.error && <span className="run-error">{run.error}</span>}
            </li>
          ))}
          {detail.recentRuns.length === 0 && <li>No runs recorded yet.</li>}
        </ul>
      </section>

      <p className="footer-note">
        Unified status: {STATUS_LABEL[detail.officialStatus]}
        {detail.officialStatus !== detail.connectivityStatus && ` · Our check: ${STATUS_LABEL[detail.connectivityStatus]}`}
      </p>
    </div>
  );
}
