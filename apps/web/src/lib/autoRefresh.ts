import { useEffect, useState } from 'react';

const AUTO_REFRESH_KEY = 'wakz.autoRefresh';

const listeners = new Set<(enabled: boolean) => void>();

/**
 * Automatic refresh is on by default: the app refreshes the full catalog when it opens and the
 * engine collects again once the seven minute cache expires. Users who would rather refresh
 * themselves can switch it off in the settings screen; manual refresh always keeps working.
 */
export function isAutoRefreshEnabled(): boolean {
  try {
    return window.localStorage.getItem(AUTO_REFRESH_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setAutoRefreshEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(AUTO_REFRESH_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage failures: the session keeps the default.
  }
  for (const listener of listeners) listener(enabled);
}

export function useAutoRefresh(): { autoRefresh: boolean; setAutoRefresh: (enabled: boolean) => void } {
  const [autoRefresh, setState] = useState(() => isAutoRefreshEnabled());
  useEffect(() => {
    const listener = (next: boolean): void => setState(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return {
    autoRefresh,
    setAutoRefresh: (enabled: boolean) => {
      setAutoRefreshEnabled(enabled);
      setState(isAutoRefreshEnabled());
    },
  };
}
