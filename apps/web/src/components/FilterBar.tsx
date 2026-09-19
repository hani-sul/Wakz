import type { UnifiedStatus } from '../api.ts';

const FILTERS: { id: 'all' | UnifiedStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'OPERATIONAL', label: 'Operational' },
  { id: 'DEGRADED', label: 'Degraded' },
  { id: 'PARTIAL_OUTAGE', label: 'Partial outage' },
  { id: 'MAJOR_OUTAGE', label: 'Outage' },
  { id: 'MAINTENANCE', label: 'Maintenance' },
  { id: 'UNKNOWN', label: 'Unknown' },
];

export function FilterBar({
  active,
  onChange,
}: {
  active: 'all' | UnifiedStatus;
  onChange: (value: 'all' | UnifiedStatus) => void;
}): React.JSX.Element {
  return (
    <div className="filter-bar" role="tablist" aria-label="Filter services by status">
      {FILTERS.map((filter) => (
        <button
          key={filter.id}
          type="button"
          role="tab"
          aria-selected={active === filter.id}
          className={active === filter.id ? 'active' : ''}
          onClick={() => onChange(filter.id)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
