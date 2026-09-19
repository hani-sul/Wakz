import { useEffect, useMemo, useState } from 'react';
import type { CategorySnapshot, ServiceCard as ServiceCardType, UnifiedStatus } from '../api.ts';
import { data } from '../data.ts';
import { FilterBar } from '../components/FilterBar.tsx';
import { ServiceCard } from '../components/ServiceCard.tsx';
import { useI18n } from '../lib/locale.tsx';
import type { Tab } from '../App.tsx';

export function Dashboard({
  tab,
  refreshToken,
  pinnedSlugs,
  onOpenService,
  onSelectTab,
}: {
  tab: Tab;
  refreshToken: number;
  pinnedSlugs: string[];
  onOpenService: (slug: string) => void;
  onSelectTab: (tab: Tab) => void;
}): React.JSX.Element {
  const i18n = useI18n();
  const [categories, setCategories] = useState<CategorySnapshot[]>([]);
  const [filter, setFilter] = useState<'all' | UnifiedStatus>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const next = await data.categories();
        if (cancelled) return;
        setCategories(next);
        setError(null);
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const allServices = useMemo(() => categories.flatMap((category) => category.services), [categories]);
  const isLocalTab = tab.kind === 'category' && tab.slug === 'local';

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const base = (tab.kind === 'category'
      ? allServices.filter((service) => service.category === tab.slug)
      : allServices)
      // The "coming soon" tile belongs to the local services category only.
      .filter((service) => isLocalTab || !service.comingSoon);
    const filtered = base.filter((service) => {
      if (filter !== 'all' && service.status !== filter && service.officialStatus !== filter && service.connectivityStatus !== filter) {
        return false;
      }
      if (!needle) return true;
      return service.name.toLowerCase().includes(needle)
        || (service.nameAr ?? '').includes(query.trim())
        || service.category.toLowerCase().includes(needle)
        || service.slug.includes(needle);
    });
    if (tab.kind !== 'all') return filtered;
    // Pinned services always come first on Home.
    return [...filtered].sort((left, right) => {
      const leftPinned = pinnedSlugs.includes(left.slug) ? 0 : 1;
      const rightPinned = pinnedSlugs.includes(right.slug) ? 0 : 1;
      if (leftPinned !== rightPinned) return leftPinned - rightPinned;
      return 0;
    });
  }, [allServices, filter, query, tab, pinnedSlugs, isLocalTab]);

  return (
    <div className="page">
      <nav className="tabs" role="tablist" aria-label={i18n.t('nav.tabs')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab.kind === 'all'}
          className={tab.kind === 'all' ? 'active' : ''}
          onClick={() => onSelectTab({ kind: 'all' })}
        >
          {i18n.t('tabs.all')}
        </button>
        {categories.map((category) => (
          <button
            key={category.slug}
            type="button"
            role="tab"
            aria-selected={tab.kind === 'category' && tab.slug === category.slug}
            className={tab.kind === 'category' && tab.slug === category.slug ? 'active' : ''}
            onClick={() => onSelectTab({ kind: 'category', slug: category.slug })}
          >
            {i18n.locale === 'ar' ? category.nameAr : category.name}
            <span className="tab-count">{category.services.length}</span>
          </button>
        ))}
      </nav>

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

      {isLocalTab && <p className="note inline-note">{i18n.t('local.note')}</p>}
      {error && <p className="error-banner">{i18n.t('dashboard.errorLoading', { error })}</p>}

      <section className="service-grid">
        {visible.map((service) => (
          <ServiceCard
            key={service.slug}
            service={service as ServiceCardType}
            onOpen={onOpenService}
          />
        ))}
      </section>

      {!loading && visible.length === 0 && !error && (
        <p className="empty-state">{i18n.t('dashboard.noMatch')}</p>
      )}

      <section className="legend">
        <div><span className="legend-dot ok" /> {i18n.t('legend.ok')}</div>
        <div><span className="legend-dot warn" /> {i18n.t('legend.warn')}</div>
        <div><span className="legend-dot critical" /> {i18n.t('legend.critical')}</div>
        <div><span className="legend-dot unknown" /> {i18n.t('legend.unknown')}</div>
      </section>
    </div>
  );
}
