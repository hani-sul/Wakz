import type { UnifiedStatus } from '../api.ts';
import { STATUS_CLASS, STATUS_LABEL } from '../lib/format.ts';

export function StatusPill({ status, subtle = false }: { status: UnifiedStatus; subtle?: boolean }): React.JSX.Element {
  return (
    <span className={`pill pill-${STATUS_CLASS[status]}${subtle ? ' pill-subtle' : ''}`}>
      <span className="pill-dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function DualStatus({ official, connectivity }: { official: UnifiedStatus; connectivity: UnifiedStatus }): React.JSX.Element {
  return (
    <div className="dual-status">
      <div>
        <span className="dual-label">Official status</span>
        <StatusPill status={official} />
      </div>
      <div>
        <span className="dual-label">Our check</span>
        <StatusPill status={connectivity} subtle />
      </div>
    </div>
  );
}
