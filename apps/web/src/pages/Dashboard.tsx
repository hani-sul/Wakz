import { useEffect, useMemo, useState } from 'react';
import { api, type CategorySnapshot, type Overview, type UnifiedStatus } from '../api.ts';
import { FilterBar } from '../components/FilterBar.tsx';
import { ServiceCard } from '../components/ServiceCard.tsx';
import { displayName, relativeTime, statusEmoji, statusLabel } from '../lib/format.ts';
import { useI18n } from '../lib/locale.tsx';

export function Dashboard({ onOpenService, onOpenCategory }: {
  onOpenService: (slug: string) => void;
  onOpenCategory: (slug: string) => void;
}): React.JSX.Element {
  const i18n = useI18n();
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
      if (filter !== 'all' && service.status !== filter && service.officialStatus !== filter && service.connectivityStatus !== filter) {
        return false;
      }
      if (!needle) return true;
      return service.name.toLowerCase().includes(needle)
        || (service.nameAr ?? '').includes(needle)
        || service.category.toLowerCase().includes(needle)
        || service.slug.includes(needle);
    });
  }, [allServices, filter, query]);

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <h1>{i18n.t('dashboard.title')}</h1>
          <p className="hero-sub">{i18n.t('dashboard.subtitle')}</p>
        </div>
        <div className="hero-status">
          {overview ? (
            <>
              <span className="hero-emoji" aria-hidden="true">{statusEmoji(overview.status)}</span>
              <div>
                <strong>{statusLabel(i18n, overview.status)}</strong>
                <span className="hero-meta">
                  {i18n.t('dashboard.servicesCount', { count: overview.services })} · {i18n.t('dashboard.updated', { time: relativeTime(i18n, overview.lastUpdate) })}
                </span>
              </div>
            </>
          ) : (
            <span className="hero-meta">{loading ? i18n.t('dashboard.loading') : i18n.t('dashboard.noData')}</span>
          )}
        </div>
      </section>

      {overview && (
        <section className="category-rail">
          {overview.categories.map((category) => {
            const outages = category.counts.MAJOR_OUTAGE + category.counts.PARTIAL_OUTAGE;
            return (
              <button
                key={category.slug}
                type="button"
                className="category-card"
                onClick={() => onOpenCategory(category.slug)}
              >
                <span className="category-name">{displayName(i18n, category.name, category.nameAr)}</span>
                <span className="category-status">
                  {statusEmoji(category.status)} {statusLabel(i18n, category.status)}
                </span>
                <span className="category-counts">
                  {outages > 0
                    ? i18n.t('dashboard.categoryOutage', { count: outages })
                    : category.counts.DEGRADED > 0
                      ? i18n.t('dashboard.categoryDegraded', { count: category.counts.DEGRADED })
                      : i18n.t('dashboard.categoryOk', { count: category.services })}
                </span>
              </button>
            );
          })}
        </section>
      )}

      <section className="controls">
        <input
          className="search-input"
          type="search"
          placeholder={i18n.t('search.servicesPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={i18n.t('search.servicesPlaceholder')}
        />
        <FilterBar active={filter} onChange={setFilter} />
      </section>

      {error && <p className="error-banner">{i18n.t('dashboard.errorLoading', { error })}</p>}

      <section className="service-grid">
        {visible.map((service) => (
          <ServiceCard key={service.slug} service={service} onOpen={onOpenService} />
        ))}
      </section>

      {!loading && visible.length === 0 && !error && (
        <p className="empty-state">{i18n.t('dashboard.noMatch')}</p>
      )}

      {overview && (
        <section className="legend">
          <div><span className="legend-dot ok" /> {i18n.t('legend.ok')}</div>
          <div><span className="legend-dot warn" /> {i18n.t('legend.warn')}</div>
          <div><span className="legend-dot critical" /> {i18n.t('legend.critical')}</div>
          <div><span className="legend-dot unknown" /> {i18n.t('legend.unknown')}</div>
        </section>
      )}
    </div>
  );
}
