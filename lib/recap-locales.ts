import { normalizeLocale, type DisplayLocale } from '~/lib/i18n/locale';

// Languages a recap can be written in, independent of the interface language.
export const recapLocales = ['fr', 'en'] as const;
export type RecapLocale = typeof recapLocales[number];
export const DEFAULT_RECAP_LOCALE: RecapLocale = 'fr';

// Each language names itself, whatever the interface language.
export const recapLocaleNames: Record<RecapLocale, string> = {
  fr: 'Français',
  en: 'English',
};

export const recapLocaleFlags: Record<RecapLocale, string> = {
  fr: '🇫🇷',
  en: '🇬🇧',
};

export function normalizeRecapLocale(value: unknown): RecapLocale | null {
  const locale = normalizeLocale(value);
  return recapLocales.find(candidate => candidate === locale) ?? null;
}

/** The saved recap languages in their order of preference, else the display language alone. */
export function getRecapLanguages(value: unknown, displayLocale: DisplayLocale): RecapLocale[] {
  const saved = Array.isArray(value)
    ? [...new Set(value.map(normalizeRecapLocale).filter((locale): locale is RecapLocale => Boolean(locale)))]
    : [];
  if (saved.length) return saved;
  return [normalizeRecapLocale(displayLocale) ?? DEFAULT_RECAP_LOCALE];
}
