import { useEffect, useState } from 'react';
import { loadSnapshot } from '../api.ts';
import { DEFAULT_APP_API_BASE, getApiBase, isAppShell, setApiBase } from '../lib/appConfig.ts';
import { useI18n } from '../lib/locale.tsx';

export function Settings({ onSaved }: { onSaved: () => void }): React.JSX.Element {
  const i18n = useI18n();
  const [value, setValue] = useState(() => getApiBase());
  const [message, setMessage] = useState<string | null>(null);
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const snapshot = await loadSnapshot();
      setSnapshotDate(snapshot?.generatedAt ?? null);
    })();
  }, []);

  const save = (): void => {
    setApiBase(value);
    setValue(getApiBase());
    setMessage(i18n.t('settings.saved'));
    onSaved();
  };

  const test = async (): Promise<void> => {
    setMessage(i18n.t('settings.testing'));
    const base = value.trim() ? value.trim().replace(/\/+$/, '') : getApiBase();
    const url = `${/^https?:\/\//i.test(base) ? base : `http://${base}`}/api/health`;
    const started = performance.now();
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await response.json();
      setMessage(i18n.t('settings.testOk', { time: Math.round(performance.now() - started) }));
    } catch (error) {
      setMessage(i18n.t('settings.testFail', { error: error instanceof Error ? error.message : String(error) }));
    }
  };

  const reset = (): void => {
    setApiBase('');
    setValue(getApiBase());
    setMessage(i18n.t('settings.saved'));
    onSaved();
  };

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <a className="back-link" href="#/">{i18n.t('category.back')}</a>
          <h1>{i18n.t('settings.title')}</h1>
          <p className="hero-sub">{i18n.t('settings.subtitle')}</p>
        </div>
      </section>

      <section className="panel">
        <label className="field">
          <span>{i18n.t('settings.serverLabel')}</span>
          <input
            type="url"
            inputMode="url"
            dir="ltr"
            value={value}
            placeholder={DEFAULT_APP_API_BASE}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <p className="note">{i18n.t('settings.serverHelp')}</p>
        <div className="button-row">
          <button type="button" onClick={save}>{i18n.t('settings.save')}</button>
          <button type="button" onClick={() => void test()}>{i18n.t('settings.test')}</button>
          <button type="button" onClick={reset}>{i18n.t('settings.reset')}</button>
        </div>
        {message && <p className="note">{message}</p>}
      </section>

      <section className="panel">
        <h2>{i18n.t('settings.title')}</h2>
        <dl className="kv">
          <div>
            <dt>{i18n.t('settings.runningIn')}</dt>
            <dd>{isAppShell() ? i18n.t('settings.modeApp') : i18n.t('settings.modeBrowser')}</dd>
          </div>
          <div>
            <dt>{i18n.t('settings.snapshotTime')}</dt>
            <dd>{snapshotDate ? new Date(snapshotDate).toLocaleString(i18n.tag) : i18n.t('settings.snapshotNone')}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
