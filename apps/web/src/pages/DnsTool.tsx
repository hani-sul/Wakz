import { useState } from 'react';
import { useI18n } from '../lib/locale.tsx';

type Provider = {
  id: string;
  name: string;
  url: string;
  noteAr: string;
  noteEn: string;
};

/** Verified DNS-over-HTTPS providers that answer with the JSON API (checked before being added). */
const PROVIDERS: Provider[] = [
  {
    id: 'cloudflare',
    name: 'Cloudflare (1.1.1.1)',
    url: 'https://cloudflare-dns.com/dns-query',
    noteAr: 'سريع ويركّز على الخصوصية',
    noteEn: 'Fast, privacy focused',
  },
  {
    id: 'cloudflare-security',
    name: 'Cloudflare Security (1.1.1.2)',
    url: 'https://security.cloudflare-dns.com/dns-query',
    noteAr: 'يحجب المواقع الضارة',
    noteEn: 'Blocks malicious domains',
  },
  {
    id: 'google',
    name: 'Google Public DNS',
    url: 'https://dns.google/resolve',
    noteAr: 'الأشهر والأكثر انتشارًا',
    noteEn: 'Most widely used',
  },
  {
    id: 'adguard',
    name: 'AdGuard DNS',
    url: 'https://dns.adguard-dns.com/resolve',
    noteAr: 'يحجب الإعلانات',
    noteEn: 'Ad blocking',
  },
  {
    id: 'nextdns',
    name: 'NextDNS',
    url: 'https://dns.nextdns.io/dns-query',
    noteAr: 'إعدادات حماية قابلة للتخصيص',
    noteEn: 'Configurable filtering',
  },
  {
    id: 'dnssb',
    name: 'DNS.SB',
    url: 'https://doh.dns.sb/dns-query',
    noteAr: 'بدون تسجيل للبيانات',
    noteEn: 'No logging',
  },
];

type Result = {
  provider: Provider;
  ok: boolean;
  ms: number | null;
  address: string | null;
  error: string | null;
};

export function DnsTool(): React.JSX.Element {
  const i18n = useI18n();
  const [domain, setDomain] = useState('example.com');
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);

  const measureOne = async (provider: Provider): Promise<Result> => {
    const started = performance.now();
    try {
      const url = `${provider.url}?name=${encodeURIComponent(domain.trim())}&type=A`;
      const response = await fetch(url, { headers: { accept: 'application/dns-json' } });
      const elapsed = Math.round(performance.now() - started);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { Answer?: { data: string; type: number }[]; Status?: number };
      const address = body.Answer?.find((answer) => answer.type === 1)?.data ?? null;
      return { provider, ok: true, ms: elapsed, address, error: null };
    } catch (error) {
      return {
        provider,
        ok: false,
        ms: null,
        address: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const measureAll = async (): Promise<void> => {
    setRunning(true);
    setResults([]);
    const collected = await Promise.all(PROVIDERS.map((provider) => measureOne(provider)));
    setResults([...collected].sort((left, right) => (left.ms ?? 99_999) - (right.ms ?? 99_999)));
    setRunning(false);
  };

  const fastest = results.find((result) => result.ok) ?? null;

  return (
    <div className="page">
      <section className="service-head">
        <button type="button" className="back-link" onClick={() => window.history.back()}>{i18n.t('tools.back')}</button>
        <h1>{i18n.t('tools.dnsTitle')}</h1>
        <p className="hero-sub">{i18n.t('tools.dnsSubtitle')}</p>
      </section>

      <section className="panel">
        <div className="tool-row">
          <label className="field">
            <span>{i18n.t('tools.domainLabel')}</span>
            <input
              dir="ltr"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                  void measureAll();
                }
              }}
              placeholder="example.com"
            />
          </label>
          <button type="button" className="primary-button" disabled={running || domain.trim().length < 3} onClick={() => void measureAll()}>
            {running ? i18n.t('tools.measuring') : i18n.t('tools.measureAll')}
          </button>
        </div>
        <p className="note">{i18n.t('tools.dnsNote')}</p>
      </section>

      {fastest && (
        <p className="note inline-note">
          {i18n.t('tools.fastest', { name: fastest.provider.name, time: fastest.ms ?? 0 })}
        </p>
      )}

      {(results.length > 0 || running) && (
        <section className="panel">
          <table className="tool-table">
            <thead>
              <tr>
                <th>{i18n.t('tools.provider')}</th>
                <th>{i18n.t('tools.time')}</th>
                <th>{i18n.t('tools.resolvedIp')}</th>
                <th>{i18n.t('tools.notes')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.provider.id} className={result.ok ? '' : 'row-error'}>
                  <td>{result.provider.name}</td>
                  <td className="num">{result.ok ? `${result.ms} ms` : '—'}</td>
                  <td className="num" dir="ltr">{result.address ?? (result.error ?? '—')}</td>
                  <td>{i18n.locale === 'ar' ? result.provider.noteAr : result.provider.noteEn}</td>
                </tr>
              ))}
              {running && (
                <tr>
                  <td colSpan={4}>{i18n.t('tools.measuring')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
