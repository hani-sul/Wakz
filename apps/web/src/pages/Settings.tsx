import { useEffect, useState } from 'react';
import { loadSnapshot } from '../api.ts';
import { data, dataMode, setDataMode, type DataMode } from '../data.ts';
import { DEFAULT_APP_API_BASE, getApiBase, isAppShell, setApiBase } from '../lib/appConfig.ts';
import { clockTime } from '../lib/format.ts';
import { useI18n } from '../lib/locale.tsx';
import { MAX_PINS } from '../lib/pins.ts';

export function Settings({ onChanged }: { onChanged: () => void }): React.JSX.Element {
  const i18n = useI18n();
  const [mode, setMode] = useState<DataMode>(() => dataMode());
  const [serverValue, setServerValue] = useState(() => getApiBase());
  const [message, setMessage] = useState<string | null>(null);
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);
  const [engine, setEngine] = useState(() => data.refreshState());

  useEffect(() => {
    void (async () => {
      const snapshot = await loadSnapshot();
      setSnapshotDate(snapshot?.generatedAt ?? null);
      setEngine(data.refreshState());
    })();
    const unsubscribe = data.subscribe((state) => setEngine(state));
    return () => unsubscribe();
  }, []);

  const chooseMode = (next: DataMode): void => {
    setMode(next);
    setDataMode(next);
    setMessage(null);
    onChanged();
  };

  const saveServer = (): void => {
    setApiBase(serverValue);
    setServerValue(getApiBase());
    setMessage(i18n.t('settings.saved'));
    onChanged();
  };

  const testServer = async (): Promise<void> => {
    setMessage(i18n.t('settings.testing'));
    const base = (serverValue.trim() || getApiBase()).replace(/\/+$/, '');
    const url = `${/^https?:\/\//i.test(base) ? base : `http://${base}`}/api/health`;
    const started = performance.now();
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await response.json();
      setMessage(i18n.t('settings.testOk', { time: Math.round(performance.now() - started) }));
    } catch (failure) {
      setMessage(i18n.t('settings.testFail', { error: failure instanceof Error ? failure.message : String(failure) }));
    }
  };

  const clearCache = async (): Promise<void> => {
    await data.clearCache();
    setMessage(i18n.t('settings.cacheCleared'));
    onChanged();
  };

  const inside = engine.insideSaudiArabia;

  return (
    <div className="page">
      <section className="service-head">
        <a className="back-link" href="#/">{i18n.t('category.back')}</a>
        <h1>{i18n.t('settings.title')}</h1>
        <p className="hero-sub">{i18n.t('settings.localNote')}</p>
      </section>

      <section className="panel">
        <h2>{i18n.t('settings.dataTitle')}</h2>
        <div className="mode-switch">
          <label className={mode === 'local' ? 'active' : ''}>
            <input type="radio" name="mode" checked={mode === 'local'} onChange={() => chooseMode('local')} />
            <span>{i18n.t('settings.preferLocal')}</span>
          </label>
          <label className={mode === 'remote' ? 'active' : ''}>
            <input type="radio" name="mode" checked={mode === 'remote'} onChange={() => chooseMode('remote')} />
            <span>{i18n.t('settings.preferRemote')}</span>
          </label>
        </div>
        {mode === 'local' ? (
          <p className="note">{i18n.t('settings.localNote')}</p>
        ) : (
          <>
            <label className="field">
              <span>{i18n.t('settings.serverLabel')}</span>
              <input
                type="url"
                inputMode="url"
                dir="ltr"
                value={serverValue}
                placeholder={DEFAULT_APP_API_BASE}
                onChange={(event) => setServerValue(event.target.value)}
              />
            </label>
            <p className="note">{i18n.t('settings.serverHelp')}</p>
            <div className="button-row">
              <button type="button" onClick={saveServer}>{i18n.t('settings.save')}</button>
              <button type="button" onClick={() => void testServer()}>{i18n.t('settings.test')}</button>
              <button type="button" onClick={() => { setApiBase(''); setServerValue(getApiBase()); onChanged(); }}>
                {i18n.t('settings.reset')}
              </button>
            </div>
          </>
        )}
        {message && <p className="note">{message}</p>}
      </section>

      <section className="panel">
        <h2>{i18n.t('settings.geoTitle')}</h2>
        <div className="button-row">
          <button type="button" className={!data.location.isManual() ? 'active' : ''} onClick={() => { data.location.setOverride(null); onChanged(); }}>
            {i18n.t('settings.geoAuto')}
          </button>
          <button type="button" className={data.location.isManual() && inside ? 'active' : ''} onClick={() => { data.location.setOverride('inside'); onChanged(); }}>
            {i18n.t('settings.geoInside')}
          </button>
          <button type="button" className={data.location.isManual() && !inside ? 'active' : ''} onClick={() => { data.location.setOverride('outside'); onChanged(); }}>
            {i18n.t('settings.geoOutside')}
          </button>
        </div>
        <p className="note">{i18n.t('settings.geoNote')}</p>
        <p className="note">{inside ? i18n.t('settings.geoInside') : i18n.t('settings.geoOutside')}</p>
      </section>

      <section className="panel">
        <h2>{i18n.t('settings.title')}</h2>
        <dl className="kv">
          <div>
            <dt>{i18n.t('settings.runningIn')}</dt>
            <dd>{isAppShell() ? i18n.t('settings.modeApp') : i18n.t('settings.modeBrowser')}</dd>
          </div>
          <div>
            <dt>{i18n.t('dashboard.updated', { time: '' }).trim()}</dt>
            <dd>{engine.lastRun ? clockTime(i18n, new Date(engine.lastRun).toISOString()) : i18n.t('common.never')}</dd>
          </div>
          <div>
            <dt>{i18n.t('pin.limit')}</dt>
            <dd>{MAX_PINS}</dd>
          </div>
          <div>
            <dt>{i18n.t('settings.snapshotTime')}</dt>
            <dd>{snapshotDate ? clockTime(i18n, snapshotDate) : i18n.t('settings.snapshotNone')}</dd>
          </div>
        </dl>
        <div className="button-row">
          <button type="button" onClick={() => void clearCache()}>{i18n.t('settings.clearCache')}</button>
        </div>
      </section>
    </div>
  );
}
