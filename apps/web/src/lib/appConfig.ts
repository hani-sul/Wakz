import { useEffect, useState } from 'react';

export const API_BASE_KEY = 'techpulse.apiBase';
/**
 * Default TechPulse server for the Android app: the address of the machine that runs the
 * collector/API on the local network. Android emulators can use http://127.0.0.1:4310 instead.
 * Users can change it in the app's settings screen at any time.
 */
export const DEFAULT_APP_API_BASE = 'http://127.0.0.1:4310';

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
  return isAppShell() ? DEFAULT_APP_API_BASE : '';
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
