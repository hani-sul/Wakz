import { useEffect, useState } from 'react';
import { api, type CategorySnapshot, type UnifiedStatus } from '../api.ts';
import { FilterBar } from '../components/FilterBar.tsx';
import { ServiceCard } from '../components/ServiceCard.tsx';
import { STATUS_LABEL, statusEmoji } from '../lib/format.ts';

export function CategoryPage({ slug, onOpenService }: { slug: string; onOpenService: (slug: string) => void }): React.JSX.Element {
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

  if (error) return <p className="error-banner">Could not load this category: {error}</p>;
  if (!category) return <p className="empty-state">Loading category…</p>;

  const services = filter === 'all' ? category.services : category.services.filter((service) => service.status === filter);

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <a className="back-link" href="#/">← All categories</a>
          <h1>{category.name}</h1>
          <p className="hero-sub">{category.description}</p>
        </div>
        <div className="hero-status">
          <span className="hero-emoji" aria-hidden="true">{statusEmoji(category.status)}</span>
          <div>
            <strong>{STATUS_LABEL[category.status]}</strong>
            <span className="hero-meta">{category.services.length} services tracked</span>
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

      {services.length === 0 && <p className="empty-state">No service in this category matches the filter.</p>}
    </div>
  );
}
