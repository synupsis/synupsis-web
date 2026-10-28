const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60],
];

/** "3 h ago", "yesterday"…; under a minute, `justNow`. */
export function formatRelativeDate(iso: string, locale: string, justNow: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return justNow;
}

export function formatAbsoluteDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' });
}
