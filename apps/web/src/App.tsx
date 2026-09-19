import { useEffect, useMemo, useState } from 'react';
import { api, resetSnapshotCache } from './api.ts';
import { useDataSource } from './lib/appConfig.ts';
import { clockTime, displayName } from './lib/format.ts';
import { useI18n } from './lib/locale.tsx';
import { Admin } from './pages/Admin.tsx';
import { CategoryPage } from './pages/CategoryPage.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { ServiceDetail } from './pages/ServiceDetail.tsx';
import { Settings } from './pages/Settings.tsx';

type Route =
  | { name: 'dashboard' }
  | { name: 'category'; slug: string }
  | { name: 'service'; slug: string }
  | { name: 'settings' }
  | { name: 'admin' };

type Suggestion = { slug: string; name: string; category: string; matchedOn: string; detail: string | null };

function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [segment, value] = clean.split('/');
  if (segment === 'service' && value) return { name: 'service', slug: value };
  if (segment === 'category' && value) return { name: 'category', slug: value };
  if (segment === 'settings') return { name: 'settings' };
  if (segment === 'admin') return { name: 'admin' };
  return { name: 'dashboard' };
}

export function App(): React.JSX.Element {
  const i18n = useI18n();
  const dataSource = useDataSource();
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const onHashChange = (): void => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const body = await api.search(needle);
        if (!controller.signal.aborted) setSuggestions(body.results ?? []);
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, reloadKey]);

  const navigate = (hash: string): void => {
    window.location.hash = hash;
    setQuery('');
    setSuggestions([]);
  };

  const content = useMemo(() => {
    switch (route.name) {
      case 'service':
        return <ServiceDetail key={`${route.slug}-${reloadKey}`} slug={route.slug} />;
      case 'category':
        return <CategoryPage key={`${route.slug}-${reloadKey}`} slug={route.slug} onOpenService={(slug) => navigate(`#/service/${slug}`)} />;
      case 'settings':
        return (
          <Settings
            onSaved={() => {
              resetSnapshotCache();
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
            onOpenService={(slug) => navigate(`#/service/${slug}`)}
            onOpenCategory={(slug) => navigate(`#/category/${slug}`)}
          />
        );
    }
  }, [route, reloadKey]);

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden="true" />
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
              if (event.key === 'Enter' && suggestions[0]) {
                navigate(`#/service/${suggestions[0].slug}`);
              }
            }}
          />
          {suggestions.length > 0 && (
            <ul className="suggestions">
              {suggestions.map((suggestion) => (
                <li key={`${suggestion.matchedOn}-${suggestion.slug}-${suggestion.detail ?? ''}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (suggestion.matchedOn === 'category') {
                        navigate(`#/category/${suggestion.category}`);
                      } else {
                        navigate(`#/service/${suggestion.slug}`);
                      }
                    }}
                  >
                    <span>{displayName(i18n, suggestion.name, i18n.locale === 'ar' ? suggestion.name : null)}</span>
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
          <a href="#/">{i18n.t('nav.dashboard')}</a>
          <a href="#/settings">{i18n.t('nav.settings')}</a>
          <a href="#/admin">{i18n.t('nav.developer')}</a>
          <button type="button" className="lang-toggle" onClick={i18n.toggleLocale} title={i18n.t('nav.languageHint')}>
            {i18n.t('nav.language')}
          </button>
        </nav>
      </header>

      {dataSource.source === 'snapshot' && (
        <div className="data-banner">
          <span>
            {i18n.t('data.snapshotBanner', {
              time: dataSource.snapshotGeneratedAt ? clockTime(i18n, dataSource.snapshotGeneratedAt) : i18n.t('common.unknown'),
            })}
          </span>
          <button
            type="button"
            onClick={() => {
              resetSnapshotCache();
              setReloadKey((value) => value + 1);
            }}
          >
            {i18n.t('data.retry')}
          </button>
        </div>
      )}

      <main>{content}</main>

      <footer className="site-footer">
        <p>{i18n.t('footer.note')}</p>
        <p className="footer-links">
          <span className={`source-state source-${dataSource.source}`}>
            {dataSource.source === 'live'
              ? i18n.t('data.live')
              : dataSource.source === 'snapshot'
                ? i18n.t('data.snapshot')
                : i18n.t('data.none')}
          </span>
        </p>
      </footer>
    </div>
  );
}
