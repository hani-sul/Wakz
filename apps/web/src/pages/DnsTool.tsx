import { useState } from 'react';
import { useI18n } from '../lib/locale.tsx';

type Provider = {
  id: string;
  name: string;
  url: string;
  /** Some providers only answer the binary DNS wire format (RFC 8484) instead of JSON. */
  wire?: boolean;
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
    name: 'Google DNS (8.8.8.8)',
    url: 'https://dns.google/resolve',
    noteAr: 'الأشهر والأكثر انتشارًا',
    noteEn: 'Most widely used',
  },
  {
    id: 'quad9',
    name: 'Quad9 (9.9.9.9)',
    url: 'https://dns.quad9.net/dns-query',
    wire: true,
    noteAr: 'يحجب النطاقات الخبيثة',
    noteEn: 'Blocks malicious domains',
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

/** Builds a minimal DNS query packet (A record) for the DNS wire format. */
function buildDnsQuery(domain: string): Uint8Array {
  const labels = domain.split('.').filter(Boolean);
  // header (12) + labels (length byte + characters) + root label (1) + qtype/qclass (4)
  const size = 12 + labels.reduce((total, label) => total + label.length + 1, 0) + 1 + 4;
  const buffer = new Uint8Array(size);
  const view = new DataView(buffer.buffer);
  view.setUint16(0, 0x1234); // transaction id
  view.setUint16(2, 0x0100); // standard query, recursion desired
  view.setUint16(4, 1); // questions
  let offset = 12;
  for (const label of labels) {
    buffer[offset] = label.length;
    offset += 1;
    for (const character of label) {
      buffer[offset] = character.charCodeAt(0);
      offset += 1;
    }
  }
  buffer[offset] = 0;
  offset += 1;
  view.setUint16(offset, 1); // QTYPE A
  view.setUint16(offset + 2, 1); // QCLASS IN
  return buffer;
}

/** Reads the first A record address from a DNS wire response. */
function parseDnsAnswer(buffer: Uint8Array): string | null {
  try {
    if (buffer.byteLength < 12) return null;
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const questionCount = view.getUint16(4);
    const answerCount = view.getUint16(6);
    let offset = 12;
    const skipName = (): void => {
      while (offset + 1 <= buffer.byteLength) {
        const length = buffer[offset] as number;
        if (length === 0) {
          offset += 1;
          return;
        }
        if ((length & 0xc0) === 0xc0) {
          offset += 2;
          return;
        }
        offset += length + 1;
      }
    };
    for (let index = 0; index < questionCount; index += 1) {
      skipName();
      if (offset + 4 > buffer.byteLength) return null;
      offset += 4;
    }
    for (let index = 0; index < answerCount; index += 1) {
      skipName();
      if (offset + 10 > buffer.byteLength) return null;
      const type = view.getUint16(offset);
      const dataLength = view.getUint16(offset + 8);
      offset += 10;
      if (type === 1 && dataLength === 4 && offset + 4 <= buffer.byteLength) {
        return `${buffer[offset]}.${buffer[offset + 1]}.${buffer[offset + 2]}.${buffer[offset + 3]}`;
      }
      offset += dataLength;
    }
    return null;
  } catch {
    return null;
  }
}

export function DnsTool(): React.JSX.Element {
  const i18n = useI18n();
  const domain = 'example.com';
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);

  const measureOne = async (provider: Provider): Promise<Result> => {
    const started = performance.now();
    try {
      if (provider.wire) {
        const response = await fetch(provider.url, {
          method: 'POST',
          headers: { 'content-type': 'application/dns-message', accept: 'application/dns-message' },
          body: buildDnsQuery(domain).buffer as ArrayBuffer,
        });
        const elapsed = Math.round(performance.now() - started);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const address = parseDnsAnswer(bytes);
        if (!address) throw new Error('no_answer');
        return { provider, ok: true, ms: elapsed, address, error: null };
      }
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
          <button type="button" className="primary-button" disabled={running} onClick={() => void measureAll()}>
            {running ? i18n.t('tools.measuring') : i18n.t('tools.measure')}
          </button>
        </div>
        <p className="note">{i18n.t('tools.dnsNote')}</p>
        <p className="note">{i18n.t('tools.dnsBrowserNote')}</p>
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
