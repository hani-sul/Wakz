import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, directionFor, localeTag, translate } from './i18n.ts';
import type { Locale } from './i18n.ts';

export type I18n = {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  tag: string;
  t: (key: string, variables?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
};

const LocaleContext = createContext<I18n | null>(null);

function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && (SUPPORTED_LOCALES as string[]).includes(stored)) return stored as Locale;
  } catch {
    // localStorage can be unavailable; fall back to the default.
  }
  return DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  useEffect(() => {
    const dir = directionFor(locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const value = useMemo<I18n>(() => ({
    locale,
    dir: directionFor(locale),
    tag: localeTag(locale),
    t: (key, variables) => translate(locale, key, variables),
    setLocale,
    toggleLocale: () => setLocale(locale === 'ar' ? 'en' : 'ar'),
  }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): I18n {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useI18n must be used inside LocaleProvider');
  return context;
}
