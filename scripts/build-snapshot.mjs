/**
 * Builds apps/web/public/snapshot.json from the local database.
 *
 * The snapshot is what the dashboard falls back to when the TechPulse server cannot be reached
 * (the Android app always ships one), so the interface still shows the last collected status
 * instead of an empty screen.
 *
 * Usage: node scripts/build-snapshot.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../packages/core/src/config.ts';
import { openDatabase } from '../packages/db/src/database.ts';
import { getRecentEvents, listServiceRows } from '../packages/db/src/repositories.ts';
import {
  buildCategorySnapshots,
  buildOverview,
  buildServiceSnapshot,
  toCategorySummary,
  toServiceCard,
  toServiceDetail,
} from '../apps/api/src/snapshots.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUTPUT = path.join(ROOT, 'apps', 'web', 'public', 'snapshot.json');
const HISTORY_HOURS = 24;

const config = loadConfig(ROOT);
const db = openDatabase(config.dbPath);

const rows = listServiceRows(db);
const services = {};

for (const row of rows) {
  const snapshot = buildServiceSnapshot(db, row.slug, HISTORY_HOURS);
  if (!snapshot) continue;
  services[snapshot.service.slug] = toServiceDetail(snapshot);
}

const snapshotFile = {
  generatedAt: new Date().toISOString(),
  database: config.dbPath,
  overview: buildOverview(db),
  categories: buildCategorySnapshots(db).map((category) => ({
    ...toCategorySummary(category),
    services: category.services.map(toServiceCard),
  })),
  services,
  events: getRecentEvents(db, 50),
};

await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(snapshotFile, null, 2)}\n`, 'utf8');

const bytes = Buffer.byteLength(JSON.stringify(snapshotFile));
console.log(
  `snapshot written: apps/web/public/snapshot.json (${Object.keys(services).length} services, ${(bytes / 1024).toFixed(0)} KB)`,
);
db.close();
