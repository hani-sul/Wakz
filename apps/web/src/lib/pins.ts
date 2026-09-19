import { useEffect, useState } from 'react';

const PINS_KEY = 'wakz.pins';
export const MAX_PINS = 10;

const listeners = new Set<(pins: string[]) => void>();

export function getPins(): string[] {
  try {
    const raw = window.localStorage.getItem(PINS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string').slice(0, MAX_PINS);
  } catch {
    return [];
  }
}

function save(pins: string[]): void {
  try {
    window.localStorage.setItem(PINS_KEY, JSON.stringify(pins.slice(0, MAX_PINS)));
  } catch {
    // Ignore storage failures.
  }
  for (const listener of listeners) listener(pins);
}

export function isPinned(slug: string): boolean {
  return getPins().includes(slug);
}

export function togglePin(slug: string): { ok: boolean; pinned: boolean; reason?: 'limit' } {
  const pins = getPins();
  if (pins.includes(slug)) {
    save(pins.filter((value) => value !== slug));
    return { ok: true, pinned: false };
  }
  if (pins.length >= MAX_PINS) return { ok: false, pinned: false, reason: 'limit' };
  save([...pins, slug]);
  return { ok: true, pinned: true };
}

export function clearPins(): void {
  save([]);
}

export function usePins(): { pins: string[]; pinned: (slug: string) => boolean; toggle: (slug: string) => { ok: boolean; pinned: boolean; reason?: 'limit' } } {
  const [pins, setPins] = useState<string[]>(() => getPins());
  useEffect(() => {
    const listener = (next: string[]): void => setPins(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return {
    pins,
    pinned: (slug: string) => pins.includes(slug),
    toggle: (slug: string) => {
      const result = togglePin(slug);
      setPins(getPins());
      return result;
    },
  };
}
