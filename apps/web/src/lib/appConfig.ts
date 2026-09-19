import { useEffect, useState } from 'react';

export const API_BASE_KEY = 'techpulse.apiBase';
/**
 * Wakz is local-first: no server address ships with the app, so nothing private is published and
 * every user decides on their own. Server mode stays empty until the user types an address in the
 * settings screen, while the local engine keeps working without any server.
 */
export const DEFAULT_APP_API_BASE = '';

/** Illustrative example shown as placeholder text only — never stored as a value. */
export const API_BASE_PLACEHOLDER = 'http://192.168.1.10:4310';

export function isAppShell(): boolean {
  return window.location.protocol === 'file:';
}

export function normalizeApiBase(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export function getApiBase(): string {
  let stored = '';
  try {
    stored = window.localStorage.getItem(API_BASE_KEY) ?? '';
  } catch {
    stored = '';
  }
  if (stored) return normalizeApiBase(stored);
  return DEFAULT_APP_API_BASE;
}

export function setApiBase(value: string): void {
  try {
    const normalized = normalizeApiBase(value);
    if (normalized) {
      window.localStorage.setItem(API_BASE_KEY, normalized);
    } else {
      window.localStorage.removeItem(API_BASE_KEY);
    }
  } catch {
    // Storage unavailable: the session keeps the default.
  }
}

export function apiUrl(path: string): string {
  return `${getApiBase()}${path}`;
}

export type DataSource = 'live' | 'snapshot' | 'none';

export type DataSourceState = {
  source: DataSource;
  error: string | null;
  snapshotGeneratedAt: string | null;
};

let state: DataSourceState = { source: 'none', error: null, snapshotGeneratedAt: null };
const listeners = new Set<(next: DataSourceState) => void>();

export function getDataSourceState(): DataSourceState {
  return state;
}

export function updateDataSource(patch: Partial<DataSourceState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

export function useDataSource(): DataSourceState {
  const [current, setCurrent] = useState<DataSourceState>(state);
  useEffect(() => {
    listeners.add(setCurrent);
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);
  return current;
}
