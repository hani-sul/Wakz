import { useEffect, useMemo, useState } from 'react';
import type { CategorySnapshot, UnifiedStatus } from '../api.ts';
import { data } from '../data.ts';
import { ServiceCard } from '../components/ServiceCard.tsx';
import { FilterBar } from '../components/FilterBar.tsx';
import { useI18n } from '../lib/locale.tsx';
import type { Tab } from '../App.tsx';

export function Dashboard({
  tab,
  pinnedSlugs,
  onOpenService,
  onSelectTab,
  onChanged,
}: {
  tab: Tab;
  pinnedSlugs: string[];
  onOpenService: (slug: string) => void;
  onSelectTab: (tab: Tab) => void;
  onChanged: () => void;
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
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [onChanged]);

  const allServices = useMemo(() => categories.flatMap((category) => category.services), [categories]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const base = tab.kind === 'pinned'
      ? allServices.filter((service) => pinnedSlugs.includes(service.slug))
      : tab.kind === 'category'
        ? allServices.filter((service) => service.category === tab.slug)
        : allServices;
    return base.filter((service) => {
      if (filter !== 'all' && service.status !== filter && service.officialStatus !== filter && service.connectivityStatus !== filter) {
        return false;
      }
      if (!needle) return true;
      return service.name.toLowerCase().includes(needle)
        || (service.nameAr ?? '').includes(query.trim())
        || service.category.toLowerCase().includes(needle)
        || service.slug.includes(needle);
    });
  }, [allServices, filter, query, tab, pinnedSlugs]);

  const localNote = tab.kind === 'category' && tab.slug === 'local';

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
          <span className="tab-count">{allServices.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab.kind === 'pinned'}
          className={tab.kind === 'pinned' ? 'active' : ''}
          onClick={() => onSelectTab({ kind: 'pinned' })}
        >
          {i18n.t('tabs.pinned')}
          <span className="tab-count">{pinnedSlugs.length}</span>
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

      {localNote && <p className="note inline-note">{i18n.t('local.note')}</p>}
      {error && <p className="error-banner">{i18n.t('dashboard.errorLoading', { error })}</p>}

      <section className="service-grid">
        {visible.map((service) => (
          <ServiceCard
            key={service.slug}
            service={service}
            onOpen={onOpenService}
            onPinChanged={onChanged}
          />
        ))}
      </section>

      {!loading && visible.length === 0 && !error && (
        <p className="empty-state">{tab.kind === 'pinned' ? i18n.t('pin.empty') : i18n.t('dashboard.noMatch')}</p>
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
