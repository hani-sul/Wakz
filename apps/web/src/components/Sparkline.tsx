import type { UnifiedStatus } from '../api.ts';
import { useI18n } from '../lib/locale.tsx';

const COLOR: Record<UnifiedStatus, string> = {
  OPERATIONAL: '#3ddc97',
  DEGRADED: '#f5c451',
  PARTIAL_OUTAGE: '#ff6b6b',
  MAJOR_OUTAGE: '#ff4d4d',
  MAINTENANCE: '#5aa9ff',
  UNKNOWN: '#6b7280',
};

export function Sparkline({
  points,
  width = 320,
  height = 56,
}: {
  points: { checkedAt: string; status: UnifiedStatus; latencyMs: number | null }[];
  width?: number;
  height?: number;
}): React.JSX.Element {
  const i18n = useI18n();

  if (points.length === 0) {
    return <div className="sparkline empty">{i18n.t('sparkline.empty')}</div>;
  }

  const values = points.map((point) => point.latencyMs ?? 0);
  const max = Math.max(...values, 1);
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const path = points
    .map((point, index) => {
      const x = index * step;
      const y = height - ((point.latencyMs ?? 0) / max) * (height - 8) - 4;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const barWidth = Math.max(2, width / Math.max(points.length, 1));

  return (
    <div className="sparkline">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={i18n.t('service.history')}>
        {points.map((point, index) => (
          <rect
            key={`${point.checkedAt}-${index}`}
            x={index * step}
            y={0}
            width={barWidth}
            height={height}
            fill={COLOR[point.status]}
            opacity={0.09}
          />
        ))}
        <path d={path} fill="none" stroke="#7c8cff" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="sparkline-meta">
        <span>{i18n.t('sparkline.samples', { count: points.length })}</span>
        <span>{i18n.t('sparkline.peak', { value: Math.round(max) })}</span>
      </div>
    </div>
  );
}
