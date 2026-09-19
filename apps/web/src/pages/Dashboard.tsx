import { useEffect, useMemo, useState } from 'react';
import { api, type CategorySnapshot, type Overview, type UnifiedStatus } from '../api.ts';
import { FilterBar } from '../components/FilterBar.tsx';
import { ServiceCard } from '../components/ServiceCard.tsx';
import { STATUS_LABEL, relativeTime, statusEmoji } from '../lib/format.ts';

export function Dashboard({ onOpenService, onOpenCategory }: {
  onOpenService: (slug: string) => void;
  onOpenCategory: (slug: string) => void;
}): React.JSX.Element {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [categories, setCategories] = useState<CategorySnapshot[]>([]);
  const [filter, setFilter] = useState<'all' | UnifiedStatus>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const [nextOverview, nextCategories] = await Promise.all([api.overview(), api.categories()]);
        if (cancelled) return;
        setOverview(nextOverview);
        setCategories(nextCategories);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const allServices = useMemo(() => categories.flatMap((category) => category.services), [categories]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allServices.filter((service) => {
      if (filter !== 'all' && service.status !== filter && service.officialStatus !== filter && service.connectivityStatus !== filter) return false;
      if (!needle) return true;
      return service.name.toLowerCase().includes(needle)
        || service.category.toLowerCase().includes(needle)
        || service.slug.includes(needle);
    });
  }, [allServices, filter, query]);

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <h1>All systems</h1>
          <p className="hero-sub">
            Official vendor status, kept separate from our own connectivity and latency checks.
          </p>
        </div>
        <div className="hero-status">
          {overview ? (
            <>
              <span className="hero-emoji" aria-hidden="true">{statusEmoji(overview.status)}</span>
              <div>
                <strong>{STATUS_LABEL[overview.status]}</strong>
                <span className="hero-meta">
                  {overview.services} services · updated {relativeTime(overview.lastUpdate)}
                </span>
              </div>
            </>
          ) : (
            <span className="hero-meta">{loading ? 'Loading…' : 'No data yet'}</span>
          )}
        </div>
      </section>

      {overview && (
        <section className="category-rail">
          {overview.categories.map((category) => (
            <button
              key={category.slug}
              type="button"
              className="category-card"
              onClick={() => onOpenCategory(category.slug)}
            >
              <span className="category-name">{category.name}</span>
              <span className="category-status">
                {statusEmoji(category.status)} {STATUS_LABEL[category.status]}
              </span>
              <span className="category-counts">
                {category.counts.MAJOR_OUTAGE + category.counts.PARTIAL_OUTAGE > 0
                  ? `${category.counts.MAJOR_OUTAGE + category.counts.PARTIAL_OUTAGE} outage`
                  : category.counts.DEGRADED > 0
                    ? `${category.counts.DEGRADED} degraded`
                    : `${category.services} services operational`}
              </span>
            </button>
          ))}
        </section>
      )}

      <section className="controls">
        <input
          className="search-input"
          type="search"
          placeholder="Search services or components…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search services"
        />
        <FilterBar active={filter} onChange={setFilter} />
      </section>

      {error && <p className="error-banner">Could not load the dashboard: {error}</p>}

      <section className="service-grid">
        {visible.map((service) => (
          <ServiceCard key={service.slug} service={service} onOpen={onOpenService} />
        ))}
      </section>

      {!loading && visible.length === 0 && !error && (
        <p className="empty-state">No service matches this filter.</p>
      )}

      {overview && (
        <section className="legend">
          <div><span className="legend-dot ok" /> Operational — vendor reports normal operation and our checks pass</div>
          <div><span className="legend-dot warn" /> Degraded — vendor reports degradation or our latency thresholds are exceeded</div>
          <div><span className="legend-dot critical" /> Outage — partial or major outage reported by the vendor</div>
          <div><span className="legend-dot unknown" /> Unknown — the vendor publishes no machine-readable status</div>
        </section>
      )}
    </div>
  );
}
