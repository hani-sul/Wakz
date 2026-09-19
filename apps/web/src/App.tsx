import { useEffect, useMemo, useRef, useState } from 'react';
import { data, type EngineState } from './data.ts';
import { Logo, XLogo } from './components/Logo.tsx';
import { useDataSource } from './lib/appConfig.ts';
import { clockTime } from './lib/format.ts';
import { useI18n } from './lib/locale.tsx';
import { usePins } from './lib/pins.ts';
import { Dashboard } from './pages/Dashboard.tsx';
import { ServiceDetail } from './pages/ServiceDetail.tsx';
import { Settings } from './pages/Settings.tsx';

export type Tab = { kind: 'all' } | { kind: 'category'; slug: string };

type Route =
  | { name: 'home'; tab: Tab }
  | { name: 'service'; slug: string }
  | { name: 'settings' };

function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [segment, value] = clean.split('/');
  if (segment === 'service' && value) return { name: 'service', slug: value };
  if (segment === 'settings') return { name: 'settings' };
  if (segment === 'admin') return { name: 'settings' };
  if (segment === 'category' && value) return { name: 'home', tab: { kind: 'category', slug: value } };
  return { name: 'home', tab: { kind: 'all' } };
}

export function App(): React.JSX.Element {
  const i18n = useI18n();
  const { pins } = usePins();
  const snapshotSource = useDataSource();
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [engine, setEngine] = useState<EngineState>(() => data.refreshState());
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const scrollMemory = useRef(0);

  useEffect(() => {
    const onHashChange = (): void => {
      const next = parseRoute(window.location.hash);
      setRoute((previous) => {
        if (previous.name === 'home' && next.name !== 'home') {
          scrollMemory.current = window.scrollY;
        } else if (previous.name !== 'home' && next.name === 'home') {
          const target = scrollMemory.current;
          window.setTimeout(() => window.scrollTo({ top: target, behavior: 'auto' }), 80);
        } else if (previous.name !== next.name) {
          window.scrollTo({ top: 0, behavior: 'auto' });
        }
        return next;
      });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await data.initialise();
      if (cancelled) return;
      setEngine(data.refreshState());
      if (data.mode() === 'local') await data.refresh({ reason: 'auto' });
      if (cancelled) return;
      setEngine(data.refreshState());
      setRefreshToken((value) => value + 1);
    })();
    const unsubscribe = data.subscribe((state) => setEngine(state));
    // While a collection runs, show measurements as soon as they are stored.
    const progressTimer = setInterval(() => {
      if (data.refreshState().running) setRefreshToken((value) => value + 1);
    }, 2500);
    const timer = setInterval(() => {
      if (data.mode() === 'local' && !data.refreshState().running) {
        void data.refresh({ reason: 'auto' }).then(() => {
          setEngine(data.refreshState());
          setRefreshToken((value) => value + 1);
        });
      }
    }, 60_000);
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(progressTimer);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const navigate = (hash: string): void => {
    window.location.hash = hash;
  };

  const refresh = async (): Promise<void> => {
    if (data.mode() === 'remote') {
      setRefreshToken((value) => value + 1);
      setNotice(i18n.t('actions.refreshing'));
      setTimeout(() => setNotice(null), 2500);
      return;
    }
    const allowed = await data.manualRefreshAllowed();
    if (!allowed.allowed) {
      setCooldown(allowed.waitSeconds);
      return;
    }
    setNotice(i18n.t('actions.refreshing'));
    setCooldown(30);
    await data.refresh({ force: true, reason: 'manual' });
    setNotice(null);
    setRefreshToken((value) => value + 1);
  };

  const content = useMemo(() => {
    switch (route.name) {
      case 'service':
        return <ServiceDetail key={route.slug} slug={route.slug} onChanged={() => setRefreshToken((value) => value + 1)} />;
      case 'settings':
        return (
          <Settings
            onChanged={() => {
              setEngine(data.refreshState());
              setRefreshToken((value) => value + 1);
            }}
          />
        );
      default:
        return (
          <Dashboard
            refreshToken={refreshToken}
            tab={route.tab}
            pinnedSlugs={pins}
            onOpenService={(slug) => navigate(`#/service/${slug}`)}
            onSelectTab={(tab) => {
              if (tab.kind === 'all') navigate('#/');
              else navigate(`#/category/${tab.slug}`);
            }}
          />
        );
    }
  }, [route, refreshToken, pins]);

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/">
          <Logo size={34} />
          <span className="brand-text">
            <strong>{i18n.t('app.brand')}</strong>
            <small>{i18n.t('app.tagline')}</small>
          </span>
        </a>

        <nav className="topnav">
          <button
            type="button"
            className="refresh-button"
            onClick={() => void refresh()}
            disabled={engine.running || cooldown > 0}
            title={i18n.t('actions.refreshLabel')}
            aria-label={i18n.t('actions.refreshLabel')}
          >
            {engine.running ? <span className="refresh-spinner" aria-hidden="true" /> : <span className="refresh-icon" aria-hidden="true">⟳</span>}
            {cooldown > 0 && <span className="refresh-cooldown">{cooldown}</span>}
          </button>
          <a className={`nav-link${route.name === 'settings' ? ' active' : ''}`} href="#/settings">{i18n.t('nav.settings')}</a>
          <button type="button" className="lang-toggle" onClick={i18n.toggleLocale} title={i18n.t('nav.languageHint')}>
            {i18n.t('nav.language')}
          </button>
        </nav>
      </header>

      {notice && <div className="data-banner info">{notice}</div>}
      {data.mode() === 'remote' && snapshotSource.source === 'snapshot' && (
        <div className="data-banner">
          <span>{i18n.t('data.snapshotBanner', { time: snapshotSource.snapshotGeneratedAt ? clockTime(i18n, snapshotSource.snapshotGeneratedAt) : i18n.t('common.unknown') })}</span>
          <button type="button" onClick={() => void refresh()}>{i18n.t('data.retry')}</button>
        </div>
      )}
      {engine.running && (
        <div className="data-banner info progress">
          <span>{i18n.t('actions.refreshing')}</span>
          <span className="progress-count">
            {engine.collected}/{engine.total}
          </span>
          <span className="progress-bar" aria-hidden="true">
            <span style={{ width: `${engine.total > 0 ? (engine.collected / engine.total) * 100 : 0}%` }} />
          </span>
        </div>
      )}

      <main>{content}</main>

      <footer className="site-footer">
        <p>{i18n.t('footer.note')}</p>
        <div className="footer-row">
          <span className={`source-state source-${data.mode() === 'remote' ? 'remote' : 'live'}`}>
            {data.mode() === 'remote' ? i18n.t('mode.remote') : i18n.t('mode.local')}
          </span>
          <span className="footer-run">
            {i18n.t('dashboard.updated', { time: engine.lastRun ? clockTime(i18n, new Date(engine.lastRun).toISOString()) : i18n.t('common.never') })}
          </span>
          <a className="signature" dir="ltr" href="https://x.com/Hany_Sul" target="_blank" rel="noreferrer noopener">
            <XLogo size={15} />
            <span>By Hany_Sul</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
