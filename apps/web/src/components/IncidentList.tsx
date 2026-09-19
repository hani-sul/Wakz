import type { IncidentRecord } from '../api.ts';
import { clockTime, statusLabel } from '../lib/format.ts';
import { useI18n } from '../lib/locale.tsx';
import { StatusPill } from './StatusPill.tsx';

export function IncidentList({ incidents, emptyLabel }: { incidents: IncidentRecord[]; emptyLabel: string }): React.JSX.Element {
  const i18n = useI18n();

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
            <span>{i18n.t('incidents.started', { time: clockTime(i18n, incident.startedAt) })}</span>
            <span>{i18n.t('incidents.updated', { time: clockTime(i18n, incident.updatedAt) })}</span>
            {incident.resolvedAt && <span>{i18n.t('incidents.resolved', { time: clockTime(i18n, incident.resolvedAt) })}</span>}
            <span className="incident-impact">{statusLabel(i18n, incident.impact)}</span>
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
              {i18n.t('incidents.viewOnPage')}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
