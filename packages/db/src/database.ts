import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL } from './schema.ts';

export type Database = DatabaseSync;

export function openDatabase(dbPath: string): DatabaseSync {
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA_SQL);
  migrate(db);
  return db;
}

/**
 * Adds columns introduced after the first release to databases that already exist.
 * SQLite has no "ADD COLUMN IF NOT EXISTS", so the current columns are inspected first.
 */
function migrate(db: DatabaseSync): void {
  const required: { table: string; column: string; definition: string }[] = [
    { table: 'categories', column: 'name_ar', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'categories', column: 'description_ar', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'services', column: 'limitation_ar', definition: 'TEXT' },
    { table: 'incidents', column: 'ends_at', definition: 'TEXT' },
  ];

  for (const entry of required) {
    const columns = db.prepare(`PRAGMA table_info(${entry.table})`).all() as { name: string }[];
    if (!columns.some((column) => column.name === entry.column)) {
      db.exec(`ALTER TABLE ${entry.table} ADD COLUMN ${entry.column} ${entry.definition}`);
    }
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
