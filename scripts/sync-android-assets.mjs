/**
 * Copies the built dashboard (apps/web/dist) plus the offline snapshot into the Android assets
 * directory, so the APK ships with the interface inside it.
 *
 * Usage: node scripts/sync-android-assets.mjs
 */
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'apps', 'web', 'dist');
const TARGET = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'www');

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(DIST))) {
  console.error('apps/web/dist is missing - run "npm run web:build" first.');
  process.exit(1);
}

await rm(TARGET, { recursive: true, force: true });
await mkdir(TARGET, { recursive: true });
await cp(DIST, TARGET, { recursive: true });

const files = await readdir(TARGET);
console.log(`android assets synced: ${files.length} entries -> ${path.relative(ROOT, TARGET)}`);
console.log(files.join(', '));
