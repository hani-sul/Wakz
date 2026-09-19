import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export function contentTypeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

export type StaticFile = { stream: NodeJS.ReadableStream; type: string; size: number };

/**
 * Resolves a request path inside the built web app. Returns null when the file is missing
 * or when the request tries to escape the build directory (path traversal).
 */
export function resolveStaticFile(webDist: string, urlPath: string): StaticFile | null {
  const root = path.resolve(webDist);
  const relative = urlPath.split('?')[0]?.replace(/^\/+/, '') ?? '';
  if (relative.includes('\0')) return null;
  const candidate = path.resolve(root, relative);
  if (!candidate.startsWith(root)) return null;
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return null;
  return {
    stream: createReadStream(candidate),
    type: contentTypeFor(candidate),
    size: statSync(candidate).size,
  };
}

export function indexFile(webDist: string): StaticFile | null {
  return resolveStaticFile(webDist, 'index.html');
}
