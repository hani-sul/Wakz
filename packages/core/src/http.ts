import { describeError } from './logger.ts';

export const DEFAULT_USER_AGENT = 'TechPulse/0.1 (+https://github.com/techpulse/status-aggregator)';

export type FetchOptions = {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  maxBytes?: number;
  method?: 'GET' | 'POST';
  body?: string;
};

export type FetchResult<T> = {
  ok: boolean;
  status: number;
  contentType: string;
  bytes: number;
  ms: number;
  finalUrl: string;
  error: string | null;
  text: string;
  data: T | null;
};

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /\.internal$/i,
  /\.local$/i,
];

/**
 * SSRF guard: connectors only ever talk to hosts from the curated catalog, and admin
 * tools must not be able to make the server fetch arbitrary internal addresses.
 */
export function isAllowedPublicUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname;
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))) return false;
  if (!host.includes('.') && host !== 'localhost') return false;
  return true;
}

function decodeBody(buffer: Buffer, contentType: string): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return buffer.subarray(2).swap16().toString('utf16le');
  }
  if (/charset=utf-16/i.test(contentType)) return buffer.toString('utf16le');
  return buffer.toString('utf8');
}

export async function fetchResource<T = unknown>(url: string, options: FetchOptions = {}): Promise<FetchResult<T>> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const retries = options.retries ?? 1;
  const maxBytes = options.maxBytes ?? 8_000_000;
  const started = Date.now();
  let lastError: string | null = null;
  let status = 0;
  let contentType = '';
  let finalUrl = url;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'user-agent': DEFAULT_USER_AGENT,
          accept: 'application/json, text/xml, application/xml, application/rss+xml, text/html;q=0.9, */*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          ...(options.headers ?? {}),
        },
        ...(options.body ? { body: options.body } : {}),
      });

      status = response.status;
      contentType = response.headers.get('content-type') ?? '';
      finalUrl = response.url || url;
      const buffer = Buffer.from(await response.arrayBuffer());
      const trimmed = buffer.byteLength > maxBytes ? buffer.subarray(0, maxBytes) : buffer;
      const text = decodeBody(trimmed, contentType);
      let data: T | null = null;
      if (/json/i.test(contentType) || /^\s*[[{]/.test(text)) {
        try {
          data = JSON.parse(text) as T;
        } catch {
          data = null;
        }
      }
      return {
        ok: response.ok,
        status,
        contentType,
        bytes: buffer.byteLength,
        ms: Date.now() - started,
        finalUrl,
        error: response.ok ? null : `HTTP ${status}`,
        text,
        data,
      };
    } catch (error) {
      lastError = describeError(error);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
        continue;
      }
    }
  }

  return {
    ok: false,
    status,
    contentType,
    bytes: 0,
    ms: Date.now() - started,
    finalUrl,
    error: lastError ?? 'request failed',
    text: '',
    data: null,
  };
}

export type XmlNode = Record<string, unknown>;

/**
 * Minimal, dependency-free XML reader for the small vendor documents we consume
 * (Xbox ServiceStatus). It intentionally supports only elements, text and attributes.
 */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = {};
  const stack: XmlNode[] = [root];
  const tokens = xml.match(/<[^>]+>|[^<]+/g) ?? [];

  for (const token of tokens) {
    if (token.startsWith('<?') || token.startsWith('<!')) continue;
    if (token.startsWith('</')) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (token.startsWith('<')) {
      const selfClosing = token.endsWith('/>');
      const body = token.slice(1, selfClosing ? -2 : -1);
      const nameMatch = /^([A-Za-z0-9_:.-]+)/.exec(body);
      if (!nameMatch) continue;
      const name = nameMatch[1] as string;
      const node: XmlNode = {};
      const attributeSection = body.slice(name.length);
      for (const attribute of attributeSection.matchAll(/([A-Za-z0-9_:.-]+)\s*=\s*"([^"]*)"/g)) {
        node[`@${attribute[1] as string}`] = attribute[2] as string;
      }
      const parent = stack[stack.length - 1] as XmlNode;
      const existing = parent[name];
      if (existing === undefined) {
        parent[name] = node;
      } else if (Array.isArray(existing)) {
        existing.push(node);
      } else {
        parent[name] = [existing, node];
      }
      if (!selfClosing) stack.push(node);
      continue;
    }
    const text = token.trim();
    if (!text) continue;
    const current = stack[stack.length - 1] as XmlNode;
    const previous = current['#text'];
    current['#text'] = previous === undefined ? text : `${String(previous)} ${text}`;
  }

  return root;
}

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function textOf(node: unknown): string | null {
  if (node === undefined || node === null) return null;
  if (typeof node === 'string') return node;
  if (typeof node === 'object' && '#text' in (node as XmlNode)) {
    return String((node as XmlNode)['#text']);
  }
  return null;
}

/** Very small RSS/Atom reader — enough for status feeds that publish <item>/<entry>. */
export type FeedItem = {
  title: string;
  link: string | null;
  description: string;
  pubDate: string | null;
  updated: string | null;
  guid: string | null;
  categories: string[];
};

export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  for (const block of blocks) {
    const pick = (tag: string): string | null => {
      const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
      if (!match) return null;
      return decodeEntities(stripCdata(match[1] ?? '').trim());
    };
    const linkMatch = /<link\b[^>]*href="([^"]+)"/i.exec(block);
    const categories = [...block.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)]
      .map((m) => decodeEntities(stripCdata(m[1] ?? '').trim()))
      .filter(Boolean);
    items.push({
      title: pick('title') ?? '(untitled)',
      link: linkMatch?.[1] ?? pick('link'),
      description: pick('description') ?? pick('summary') ?? pick('content') ?? '',
      pubDate: pick('pubDate') ?? pick('published'),
      updated: pick('updated') ?? pick('atom:updated'),
      guid: pick('guid') ?? pick('id'),
      categories,
    });
  }
  return items;
}

function stripCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export function stripHtml(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
