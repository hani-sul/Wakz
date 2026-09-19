import { useEffect, useState } from 'react';
import { api, type CategorySnapshot, type UnifiedStatus } from '../api.ts';
import { FilterBar } from '../components/FilterBar.tsx';
import { ServiceCard } from '../components/ServiceCard.tsx';
import { displayName, statusEmoji, statusLabel } from '../lib/format.ts';
import { useI18n } from '../lib/locale.tsx';

export function CategoryPage({ slug, onOpenService }: { slug: string; onOpenService: (slug: string) => void }): React.JSX.Element {
  const i18n = useI18n();
  const [category, setCategory] = useState<CategorySnapshot | null>(null);
  const [filter, setFilter] = useState<'all' | UnifiedStatus>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const categories = await api.categories();
        if (cancelled) return;
        setCategory(categories.find((item) => item.slug === slug) ?? null);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [slug]);

  if (error) return <p className="error-banner">{i18n.t('category.error', { error })}</p>;
  if (!category) return <p className="empty-state">{i18n.t('category.loading')}</p>;

  const services = filter === 'all'
    ? category.services
    : category.services.filter((service) =>
      service.status === filter || service.officialStatus === filter || service.connectivityStatus === filter);

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <a className="back-link" href="#/">{i18n.t('category.back')}</a>
          <h1>{displayName(i18n, category.name, category.nameAr)}</h1>
          <p className="hero-sub">{i18n.locale === 'ar' ? category.descriptionAr : category.description}</p>
        </div>
        <div className="hero-status">
          <span className="hero-emoji" aria-hidden="true">{statusEmoji(category.status)}</span>
          <div>
            <strong>{statusLabel(i18n, category.status)}</strong>
            <span className="hero-meta">{i18n.t('category.tracked', { count: category.services.length })}</span>
          </div>
        </div>
      </section>

      <section className="controls">
        <FilterBar active={filter} onChange={setFilter} />
      </section>

      <section className="service-grid">
        {services.map((service) => (
          <ServiceCard key={service.slug} service={service} onOpen={onOpenService} />
        ))}
      </section>

      {services.length === 0 && <p className="empty-state">{i18n.t('category.noMatch')}</p>}
    </div>
  );
}
