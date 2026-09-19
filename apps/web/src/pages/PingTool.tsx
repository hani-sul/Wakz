import { useState } from 'react';
import { useI18n } from '../lib/locale.tsx';
import { httpPing, nativeAvailable, nativePing, type NativePingResult } from '../lib/native.ts';

const HOST_PATTERN = /^[a-zA-Z0-9._:-]{3,253}$/;

export function PingTool(): React.JSX.Element {
  const i18n = useI18n();
  const [host, setHost] = useState('1.1.1.1');
  const [count, setCount] = useState(4);
  const [result, setResult] = useState<NativePingResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const measure = async (): Promise<void> => {
    const target = host.trim();
    if (!HOST_PATTERN.test(target)) {
      setError(i18n.t('tools.invalidHost'));
      return;
    }
    setError(null);
    setRunning(true);
    setResult(null);
    const native = await nativePing(target, count);
    let finalResult = native;
    // A blocked ICMP path is not proof that the host is down (the same rule the collector uses),
    // so fall back to an HTTP round trip and label the switch.
    if (native && !native.ok) {
      const fallback = await httpPing(target, count);
      if (fallback.ok) finalResult = { ...fallback, error: 'icmp_blocked' };
    }
    if (!finalResult) finalResult = await httpPing(target, count);
    setResult(finalResult);
    setRunning(false);
  };

  const times = (result?.attempts ?? []).map((attempt) => attempt.ms).filter((value): value is number => value !== null);
  const min = times.length > 0 ? Math.min(...times) : null;
  const max = times.length > 0 ? Math.max(...times) : null;
  const avg = times.length > 0 ? Math.round(times.reduce((sum, value) => sum + value, 0) / times.length) : null;

  return (
    <div className="page">
      <section className="service-head">
        <button type="button" className="back-link" onClick={() => window.history.back()}>{i18n.t('tools.back')}</button>
        <h1>{i18n.t('tools.pingTitle')}</h1>
        <p className="hero-sub">{i18n.t('tools.pingSubtitle')}</p>
      </section>

      <section className="panel">
        <div className="tool-row">
          <label className="field">
            <span>{i18n.t('tools.hostLabel')}</span>
            <input
              dir="ltr"
              inputMode="url"
              value={host}
              onChange={(event) => setHost(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                  void measure();
                }
              }}
              placeholder="8.8.8.8"
            />
          </label>
          <label className="field small">
            <span>{i18n.t('tools.attempts')}</span>
            <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
              <option value={2}>2</option>
              <option value={4}>4</option>
              <option value={6}>6</option>
            </select>
          </label>
          <button type="button" className="primary-button" disabled={running} onClick={() => void measure()}>
            {running ? i18n.t('tools.measuring') : i18n.t('tools.measure')}
          </button>
        </div>
        <p className="note">{nativeAvailable() ? i18n.t('tools.pingNativeNote') : i18n.t('tools.pingHttpNote')}</p>
        {error && <p className="error-inline">{error}</p>}
      </section>

      {result && (
        <section className="panel">
          <h2>{i18n.t('tools.results')}</h2>
          <dl className="kv">
            <div><dt>{i18n.t('tools.method')}</dt><dd>{result.method === 'icmp' ? 'ICMP' : 'HTTP'}</dd></div>
            <div><dt>{i18n.t('tools.min')}</dt><dd className="num">{min === null ? '—' : `${min} ms`}</dd></div>
            <div><dt>{i18n.t('tools.avg')}</dt><dd className="num">{avg === null ? '—' : `${avg} ms`}</dd></div>
            <div><dt>{i18n.t('tools.max')}</dt><dd className="num">{max === null ? '—' : `${max} ms`}</dd></div>
            <div><dt>{i18n.t('tools.loss')}</dt><dd className="num">{result.lossPercent === null ? '—' : `${result.lossPercent}%`}</dd></div>
          </dl>
          <ul className="ping-list">
            {result.attempts.map((attempt) => (
              <li key={attempt.seq}>
                <span>#{attempt.seq}</span>
                <strong className="num">{attempt.ms === null ? i18n.t('tools.timeout') : `${attempt.ms} ms`}</strong>
              </li>
            ))}
          </ul>
          {result.error && <p className="error-inline">{i18n.t('tools.pingError', { error: result.error })}</p>}
          {result.error === 'icmp_blocked' && <p className="note">{i18n.t('tools.pingIcmpBlocked')}</p>}
        </section>
      )}
    </div>
  );
}
