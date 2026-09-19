import { useEffect, useMemo, useState } from 'react';
import { data, type EngineState } from './data.ts';
import { Logo, XLogo } from './components/Logo.tsx';
import { useDataSource } from './lib/appConfig.ts';
import { clockTime, displayName } from './lib/format.ts';
import { useI18n } from './lib/locale.tsx';
import { usePins } from './lib/pins.ts';
import { Admin } from './pages/Admin.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { ServiceDetail } from './pages/ServiceDetail.tsx';
import { Settings } from './pages/Settings.tsx';

export type Tab = { kind: 'all' } | { kind: 'pinned' } | { kind: 'category'; slug: string };

type Route =
  | { name: 'home'; tab: Tab }
  | { name: 'service'; slug: string }
  | { name: 'settings' }
  | { name: 'admin' };

type Suggestion = { slug: string; name: string; category: string; matchedOn: string; detail: string | null };

function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [segment, value] = clean.split('/');
  if (segment === 'service' && value) return { name: 'service', slug: value };
  if (segment === 'settings') return { name: 'settings' };
  if (segment === 'admin') return { name: 'admin' };
  if (segment === 'pinned') return { name: 'home', tab: { kind: 'pinned' } };
  if (segment === 'category' && value) return { name: 'home', tab: { kind: 'category', slug: value } };
  return { name: 'home', tab: { kind: 'all' } };
}

export function App(): React.JSX.Element {
  const i18n = useI18n();
  const snapshotSource = useDataSource();
  const { pins } = usePins();
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [engine, setEngine] = useState<EngineState>(() => data.refreshState());
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const onHashChange = (): void => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Local-first bootstrap: detect the device location, then refresh anything older than 10 minutes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await data.initialise();
      if (cancelled) return;
      setEngine(data.refreshState());
      if (data.mode() === 'local') await data.refresh({ reason: 'auto' });
      if (cancelled) return;
      setEngine(data.refreshState());
      setReloadKey((value) => value + 1);
    })();
    const unsubscribe = data.subscribe((state) => setEngine(state));
    const timer = setInterval(() => {
      if (data.mode() === 'local' && !data.refreshState().running) {
        void data.refresh({ reason: 'auto' }).then(() => setEngine(data.refreshState()));
      }
    }, 60_000);
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const body = await data.search(needle);
        setSuggestions(body.results ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, reloadKey]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const navigate = (hash: string): void => {
    window.location.hash = hash;
    setQuery('');
    setSuggestions([]);
  };

  const refresh = async (): Promise<void> => {
    if (data.mode() === 'remote') {
      setReloadKey((value) => value + 1);
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
    setReloadKey((value) => value + 1);
  };

  const content = useMemo(() => {
    switch (route.name) {
      case 'service':
        return <ServiceDetail key={`${route.slug}-${reloadKey}`} slug={route.slug} onChanged={() => setReloadKey((value) => value + 1)} />;
      case 'settings':
        return (
          <Settings
            onChanged={() => {
              setEngine(data.refreshState());
              setReloadKey((value) => value + 1);
            }}
          />
        );
      case 'admin':
        return <Admin />;
      default:
        return (
          <Dashboard
            key={reloadKey}
            tab={route.tab}
            pinnedSlugs={pins}
            onOpenService={(slug) => navigate(`#/service/${slug}`)}
            onSelectTab={(tab) => {
              if (tab.kind === 'all') navigate('#/');
              else if (tab.kind === 'pinned') navigate('#/pinned');
              else navigate(`#/category/${tab.slug}`);
            }}
            onChanged={() => setReloadKey((value) => value + 1)}
          />
        );
    }
  }, [route, reloadKey, pins]);

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/">
          <Logo size={34} />
          <span>
            <strong>{i18n.t('app.brand')}</strong>
            <small>{i18n.t('app.tagline')}</small>
          </span>
        </a>

        <div className="global-search">
          <input
            type="search"
            value={query}
            placeholder={i18n.t('search.globalPlaceholder')}
            aria-label={i18n.t('search.globalPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && suggestions[0]) navigate(`#/service/${suggestions[0].slug}`);
            }}
          />
          {suggestions.length > 0 && (
            <ul className="suggestions">
              {suggestions.map((suggestion) => (
                <li key={`${suggestion.matchedOn}-${suggestion.slug}-${suggestion.detail ?? ''}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (suggestion.matchedOn === 'category') navigate(`#/category/${suggestion.category}`);
                      else navigate(`#/service/${suggestion.slug}`);
                    }}
                  >
                    <span>{suggestion.name}</span>
                    <small>
                      {suggestion.matchedOn === 'component'
                        ? `${i18n.t('search.kind.component')} · ${suggestion.detail}`
                        : suggestion.matchedOn === 'category'
                          ? i18n.t('search.kind.category')
                          : i18n.t('search.kind.service')}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <nav className="topnav">
          <button type="button" className="refresh-button" onClick={() => void refresh()} disabled={engine.running || cooldown > 0}>
            {engine.running
              ? i18n.t('actions.refreshing')
              : cooldown > 0
                ? i18n.t('actions.refreshCooldown', { seconds: cooldown })
                : i18n.t('actions.refresh')}
          </button>
          <a href="#/settings">{i18n.t('nav.settings')}</a>
          <a href="#/admin">{i18n.t('nav.developer')}</a>
          <button type="button" className="lang-toggle" onClick={i18n.toggleLocale} title={i18n.t('nav.languageHint')}>
            {i18n.t('nav.language')}
          </button>
        </nav>
      </header>

      {notice && <div className="data-banner info">{notice}</div>}

      {data.mode() === 'remote' && snapshotSource.source === 'snapshot' && (
        <div className="data-banner">
          <span>
            {i18n.t('data.snapshotBanner', {
              time: snapshotSource.snapshotGeneratedAt ? clockTime(i18n, snapshotSource.snapshotGeneratedAt) : i18n.t('common.unknown'),
            })}
          </span>
          <button type="button" onClick={() => void refresh()}>{i18n.t('data.retry')}</button>
        </div>
      )}

      <main>{content}</main>

      <footer className="site-footer">
        <p>{i18n.t('footer.note')}</p>
        <div className="footer-row">
          <span className={`source-state source-${data.mode() === 'remote' ? snapshotSource.source : 'live'}`}>
            {data.mode() === 'remote' ? i18n.t('mode.remote') : i18n.t('mode.local')}
          </span>
          <span className="footer-run">
            {i18n.t('dashboard.updated', { time: engine.lastRun ? clockTime(i18n, new Date(engine.lastRun).toISOString()) : i18n.t('common.never') })}
          </span>
          <a className="signature" href="https://x.com/Hany_Sul" target="_blank" rel="noreferrer noopener">
            <XLogo size={15} />
            <span>{i18n.t('footer.signature')}</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
