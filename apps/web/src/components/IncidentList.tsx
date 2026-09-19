import type { IncidentRecord } from '../api.ts';
import { clockTime, STATUS_LABEL } from '../lib/format.ts';
import { StatusPill } from './StatusPill.tsx';

export function IncidentList({ incidents, emptyLabel }: { incidents: IncidentRecord[]; emptyLabel: string }): React.JSX.Element {
  if (incidents.length === 0) {
    return <p className="empty-state">{emptyLabel}</p>;
  }

  return (
    <ul className="incident-list">
      {incidents.map((incident) => (
        <li key={`${incident.kind}-${incident.externalId}`}>
          <div className="incident-head">
            <StatusPill status={incident.impact} />
            <strong>{incident.title}</strong>
            <span className="incident-status">{incident.status}</span>
          </div>
          <div className="incident-meta">
            <span>Started {clockTime(incident.startedAt)}</span>
            <span>Updated {clockTime(incident.updatedAt)}</span>
            {incident.resolvedAt && <span>Resolved {clockTime(incident.resolvedAt)}</span>}
            <span className="incident-impact">{STATUS_LABEL[incident.impact]}</span>
          </div>
          {incident.description && <p className="incident-body">{incident.description}</p>}
          {incident.components.length > 0 && (
            <div className="incident-components">
              {incident.components.slice(0, 8).map((component) => (
                <span key={component} className="chip">{component}</span>
              ))}
            </div>
          )}
          {incident.url && (
            <a className="incident-link" href={incident.url} target="_blank" rel="noreferrer noopener">
              View on the official status page
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
