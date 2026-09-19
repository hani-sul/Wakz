import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const FIXTURES = path.resolve(import.meta.dirname, 'fixtures');

export async function fixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURES, name), 'utf8');
}

export async function fixtureBuffer(name: string): Promise<Buffer> {
  return readFile(path.join(FIXTURES, name));
}

/**
 * Replaces global fetch with a fixture server so connectors can be tested offline and
 * deterministically. Returns a restore function.
 */
export function mockFetch(routes: Record<string, { body: string | Buffer; status?: number; contentType?: string }>): () => void {
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const match = routes[url];
    if (!match) {
      return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
    const body = typeof match.body === 'string' ? match.body : new Uint8Array(match.body);
    return new Response(body as BodyInit, {
      status: match.status ?? 200,
      headers: { 'content-type': match.contentType ?? 'application/json' },
    });
  }) as typeof fetch;

  return () => {
    globalThis.fetch = original;
  };
}
