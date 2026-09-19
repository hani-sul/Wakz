import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { apiUrl } from '../lib/appConfig.ts';
import { clockTime } from '../lib/format.ts';
import { useI18n } from '../lib/locale.tsx';

type AdminOverview = {
  database: Record<string, number>;
  services: {
    slug: string; name: string; category: string; connector: string; sourceKind: string;
    official: boolean; confidence: string; pollSeconds: number; enabled: boolean;
    statusPage: string | null; limitation: string | null;
  }[];
  recentRuns: { service_slug: string; started_at: string; ok: number; duration_ms: number | null; error: string | null }[];
  recentEvents: { service_slug: string; message: string; created_at: string }[];
};

export function Admin(): React.JSX.Element {
  const i18n = useI18n();
  const [token, setToken] = useState(() => sessionStorage.getItem('techpulse.adminToken') ?? '');
  const [data, setData] = useState<AdminOverview | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const load = async (): Promise<void> => {
    if (!token) return;
    try {
      const response = await fetch(apiUrl('/api/admin/overview'), { headers: { 'x-admin-token': token } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      setData((await response.json()) as AdminOverview);
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    void load();
    // The token is the only input for the first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const append = (line: string): void => setLog((current) => [`${new Date().toLocaleTimeString(i18n.tag)} ${line}`, ...current].slice(0, 30));

  const runCheck = async (slug: string): Promise<void> => {
    append(i18n.t('admin.running', { slug }));
    const response = await fetch(apiUrl(`/api/admin/services/${slug}/check`), {
      method: 'POST',
      headers: { 'x-admin-token': token },
    });
    const body = await response.json();
    append(`${slug}: ${response.ok ? 'ok' : 'error'} ${JSON.stringify(body.summary?.officialStatus ?? body).slice(0, 160)}`);
    await load();
  };

  const testUrl = async (): Promise<void> => {
    const url = window.prompt(i18n.locale === 'ar' ? 'عنوان URL عام (https) للاختبار (محمي ضد SSRF):' : 'Public https:// URL to test (SSRF-protected):');
    if (!url) return;
    const response = await fetch(apiUrl('/api/admin/test-url'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ url }),
    });
    const body = await response.json();
    append(`test-url ${url}: ${response.status} ${JSON.stringify(body).slice(0, 200)}`);
  };

  const health = async (): Promise<void> => {
    const body = await api.health();
    append(`health: ${JSON.stringify(body.database)}`);
  };

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <a className="back-link" href="#/">{i18n.t('category.back')}</a>
          <h1>{i18n.t('admin.title')}</h1>
          <p className="hero-sub">{i18n.t('admin.subtitle')}</p>
        </div>
      </section>

      <section className="panel">
        <label className="field">
          <span>{i18n.t('admin.token')}</span>
          <input
            type="password"
            value={token}
            placeholder="TECHPULSE_ADMIN_TOKEN"
            onChange={(event) => {
              setToken(event.target.value);
              sessionStorage.setItem('techpulse.adminToken', event.target.value);
            }}
          />
        </label>
        <div className="button-row">
          <button type="button" onClick={() => void load()}>{i18n.t('admin.load')}</button>
          <button type="button" onClick={() => void testUrl()}>{i18n.t('admin.testUrl')}</button>
          <button type="button" onClick={() => void health()}>{i18n.t('admin.dbCounts')}</button>
        </div>
        {status && <p className="error-inline">{status}</p>}
      </section>

      {data && (
        <>
          <section className="panel">
            <h2>{i18n.t('admin.database')}</h2>
            <ul className="run-list">
              {Object.entries(data.database).map(([table, count]) => (
                <li key={table}><span>{table}</span><strong>{count}</strong></li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h2>{i18n.t('admin.services')} ({data.services.length})</h2>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{i18n.t('admin.tableService')}</th>
                  <th>{i18n.t('admin.tableCategory')}</th>
                  <th>{i18n.t('admin.tableConnector')}</th>
                  <th>{i18n.t('admin.tableSource')}</th>
                  <th>{i18n.t('admin.tableOfficial')}</th>
                  <th>{i18n.t('admin.tableConfidence')}</th>
                  <th>{i18n.t('admin.tablePoll')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.services.map((service) => (
                  <tr key={service.slug}>
                    <td>{service.name}</td>
                    <td>{service.category}</td>
                    <td>{service.connector}</td>
                    <td>{service.sourceKind}</td>
                    <td>{service.official ? i18n.t('admin.yes') : i18n.t('admin.no')}</td>
                    <td>{service.confidence}</td>
                    <td>{service.pollSeconds}s</td>
                    <td>
                      <button type="button" className="mini" onClick={() => void runCheck(service.slug)}>
                        {i18n.t('admin.runCheck')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h2>{i18n.t('admin.runs')}</h2>
            <ul className="run-list">
              {data.recentRuns.map((run) => (
                <li key={`${run.service_slug}-${run.started_at}`}>
                  <span>{run.service_slug}</span>
                  <span className={run.ok === 1 ? 'run-ok' : 'run-fail'}>{run.ok === 1 ? 'ok' : 'error'}</span>
                  <span>{clockTime(i18n, run.started_at)}</span>
                  <span>{run.duration_ms ?? 0} ms</span>
                  {run.error && <span className="run-error">{run.error}</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h2>{i18n.t('admin.events')}</h2>
            <ul className="run-list">
              {data.recentEvents.map((event) => (
                <li key={`${event.service_slug}-${event.created_at}`}>
                  <span>{clockTime(i18n, event.created_at)}</span>
                  <span>{event.service_slug}</span>
                  <span>{event.message}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="panel">
        <h2>{i18n.t('admin.log')}</h2>
        <pre className="console">{log.length > 0 ? log.join('\n') : i18n.t('admin.logEmpty')}</pre>
      </section>
    </div>
  );
}
