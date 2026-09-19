import { useEffect, useMemo, useState } from 'react';
import { api } from './api.ts';
import { Admin } from './pages/Admin.tsx';
import { CategoryPage } from './pages/CategoryPage.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { ServiceDetail } from './pages/ServiceDetail.tsx';

type Route =
  | { name: 'dashboard' }
  | { name: 'category'; slug: string }
  | { name: 'service'; slug: string }
  | { name: 'admin' };

function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [segment, value] = clean.split('/');
  if (segment === 'service' && value) return { name: 'service', slug: value };
  if (segment === 'category' && value) return { name: 'category', slug: value };
  if (segment === 'admin') return { name: 'admin' };
  return { name: 'dashboard' };
}

export function App(): React.JSX.Element {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<{ slug: string; name: string; category: string; matchedOn: string; detail: string | null }[]>([]);

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
        const response = await fetch(`/api/search?q=${encodeURIComponent(needle)}`, { signal: controller.signal });
        if (!response.ok) return;
        const body = (await response.json()) as { results: typeof suggestions };
        setSuggestions(body.results ?? []);
      } catch {
        /* aborted or offline */
      }
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const navigate = (hash: string): void => {
    window.location.hash = hash;
    setQuery('');
    setSuggestions([]);
  };

  const content = useMemo(() => {
    switch (route.name) {
      case 'service':
        return <ServiceDetail slug={route.slug} />;
      case 'category':
        return <CategoryPage slug={route.slug} onOpenService={(slug) => navigate(`#/service/${slug}`)} />;
      case 'admin':
        return <Admin />;
      default:
        return (
          <Dashboard
            onOpenService={(slug) => navigate(`#/service/${slug}`)}
            onOpenCategory={(slug) => navigate(`#/category/${slug}`)}
          />
        );
    }
  }, [route]);

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <strong>TechPulse</strong>
            <small>service status, aggregated</small>
          </span>
        </a>

        <div className="global-search">
          <input
            type="search"
            value={query}
            placeholder="Search services, categories, components…"
            aria-label="Global search"
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
                    <span>{suggestion.name}</span>
                    <small>
                      {suggestion.matchedOn === 'component' ? `component · ${suggestion.detail}` : suggestion.category}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <nav className="topnav">
          <a href="#/">Dashboard</a>
          <a href="#/admin">Developer</a>
        </nav>
      </header>

      <main>{content}</main>

      <footer className="site-footer">
        <p>
          TechPulse separates <strong>official vendor status</strong> from <strong>our own connectivity checks</strong>.
          Latency is measured from a single central collector unless a probe is deployed for a region, and it never
          overrides what a vendor reports.
        </p>
        <p className="footer-links">
          <a href="https://github.com/" target="_blank" rel="noreferrer noopener">Sources documented in docs/data-sources.md</a>
        </p>
      </footer>
    </div>
  );
}
