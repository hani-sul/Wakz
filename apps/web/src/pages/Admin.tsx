import { useEffect, useState } from 'react';
import { api } from '../api.ts';

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
  const [token, setToken] = useState(() => sessionStorage.getItem('techpulse.adminToken') ?? '');
  const [data, setData] = useState<AdminOverview | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const load = async (): Promise<void> => {
    if (!token) return;
    try {
      const response = await fetch('/api/admin/overview', { headers: { 'x-admin-token': token } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      setData((await response.json()) as AdminOverview);
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const append = (line: string): void => setLog((current) => [`${new Date().toLocaleTimeString()} ${line}`, ...current].slice(0, 30));

  const runCheck = async (slug: string): Promise<void> => {
    append(`running check for ${slug}…`);
    const response = await fetch(`/api/admin/services/${slug}/check`, { method: 'POST', headers: { 'x-admin-token': token } });
    const body = await response.json();
    append(`${slug}: ${response.ok ? 'ok' : 'error'} ${response.ok ? JSON.stringify(body.summary?.officialStatus ?? body.summary) : JSON.stringify(body).slice(0, 200)}`);
    await load();
  };

  const testUrl = async (): Promise<void> => {
    const url = window.prompt('Public https:// URL to test (SSRF-protected):');
    if (!url) return;
    const response = await fetch('/api/admin/test-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ url }),
    });
    const body = await response.json();
    append(`test-url ${url}: ${response.status} ${JSON.stringify(body).slice(0, 220)}`);
  };

  const health = async (): Promise<void> => {
    const body = await api.health();
    append(`health: ${JSON.stringify(body.database)}`);
  };

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <a className="back-link" href="#/">← Dashboard</a>
          <h1>Developer tools</h1>
          <p className="hero-sub">
            Admin routes stay disabled until <code>TECHPULSE_ADMIN_TOKEN</code> is set. The token is kept in this browser
            session only.
          </p>
        </div>
      </section>

      <section className="panel">
        <label className="field">
          <span>Admin token</span>
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
          <button type="button" onClick={() => void load()}>Load admin data</button>
          <button type="button" onClick={() => void testUrl()}>Test a URL</button>
          <button type="button" onClick={() => void health()}>Show DB counts</button>
        </div>
        {status && <p className="error-inline">{status}</p>}
      </section>

      {data && (
        <>
          <section className="panel">
            <h2>Database</h2>
            <ul className="run-list">
              {Object.entries(data.database).map(([table, count]) => (
                <li key={table}><span>{table}</span><strong>{count}</strong></li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h2>Services ({data.services.length})</h2>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Service</th><th>Category</th><th>Connector</th><th>Source</th><th>Official</th>
                  <th>Conf.</th><th>Poll</th><th />
                </tr>
              </thead>
              <tbody>
                {data.services.map((service) => (
                  <tr key={service.slug}>
                    <td>{service.name}</td>
                    <td>{service.category}</td>
                    <td>{service.connector}</td>
                    <td>{service.sourceKind}</td>
                    <td>{service.official ? 'yes' : 'no'}</td>
                    <td>{service.confidence}</td>
                    <td>{service.pollSeconds}s</td>
                    <td>
                      <button type="button" className="mini" onClick={() => void runCheck(service.slug)}>Run check</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h2>Recent connector runs</h2>
            <ul className="run-list">
              {data.recentRuns.map((run) => (
                <li key={`${run.service_slug}-${run.started_at}`}>
                  <span>{run.service_slug}</span>
                  <span className={run.ok === 1 ? 'run-ok' : 'run-fail'}>{run.ok === 1 ? 'ok' : 'error'}</span>
                  <span>{new Date(run.started_at).toLocaleTimeString()}</span>
                  <span>{run.duration_ms ?? 0} ms</span>
                  {run.error && <span className="run-error">{run.error}</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h2>Events</h2>
            <ul className="run-list">
              {data.recentEvents.map((event) => (
                <li key={`${event.service_slug}-${event.created_at}`}>
                  <span>{new Date(event.created_at).toLocaleTimeString()}</span>
                  <span>{event.service_slug}</span>
                  <span>{event.message}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="panel">
        <h2>Session log</h2>
        <pre className="console">{log.length > 0 ? log.join('\n') : 'No actions yet.'}</pre>
      </section>
    </div>
  );
}
