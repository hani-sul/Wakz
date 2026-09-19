import type { UnifiedStatus } from '../api.ts';
import { useI18n } from '../lib/locale.tsx';

const FILTER_ORDER: ('all' | UnifiedStatus)[] = [
  'all',
  'OPERATIONAL',
  'DEGRADED',
  'PARTIAL_OUTAGE',
  'MAJOR_OUTAGE',
  'MAINTENANCE',
  'UNKNOWN',
];

export function FilterBar({
  active,
  onChange,
}: {
  active: 'all' | UnifiedStatus;
  onChange: (value: 'all' | UnifiedStatus) => void;
}): React.JSX.Element {
  const i18n = useI18n();
  return (
    <div className="filter-bar" role="tablist" aria-label={i18n.t('filters.all')}>
      {FILTER_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          className={active === id ? 'active' : ''}
          onClick={() => onChange(id)}
        >
          {id === 'all' ? i18n.t('filters.all') : i18n.t(`filters.${id}`)}
        </button>
      ))}
    </div>
  );
}
