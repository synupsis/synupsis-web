export const supportedLocales = ['en', 'fr'] as const;
export type DisplayLocale = typeof supportedLocales[number];
export type LanguagePreference = DisplayLocale | 'browser';
export type TranslationParams = Record<string, string | number>;
export type Translate = (message: string, params?: TranslationParams) => string;

export function normalizeLocale(value: unknown): DisplayLocale | null {
  if (typeof value !== 'string') return null;
  const language = value.trim().toLowerCase().split(/[-_]/)[0];
  return supportedLocales.find(locale => locale === language) ?? null;
}

export function getBrowserLocale(languages: readonly string[]): DisplayLocale {
  for (const language of languages) {
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }
  return 'en';
}

export function getRequestLocale(acceptLanguage = ''): DisplayLocale {
  const languages = acceptLanguage.split(',').map((entry, index) => {
    const [language = '', ...parameters] = entry.trim().split(';');
    const quality = parameters.find(parameter => parameter.trim().startsWith('q='));
    return { language, quality: quality ? Number(quality.trim().slice(2)) : 1, index };
  }).filter(entry => Number.isFinite(entry.quality) && entry.quality > 0 && entry.quality <= 1)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return getBrowserLocale(languages.map(entry => entry.language));
}

export function getLanguagePreference(value: unknown): LanguagePreference {
  return value === 'en' || value === 'fr' ? value : 'browser';
}

export function translate(message: string, locale: DisplayLocale, french: Record<string, string>, params: TranslationParams = {}): string {
  const text = locale === 'fr' && Object.hasOwn(french, message) ? french[message]! : message;
  return text.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(params, key) ? String(params[key]) : placeholder);
}
