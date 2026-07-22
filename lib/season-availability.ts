const MIN_MEANINGFUL_YEAR = 1900;

export function isSeasonReleased(
  firstAired: string | null | undefined,
  now = Date.now(),
): boolean {
  if (typeof firstAired !== 'string' || !firstAired.trim()) return false;

  const releaseDate = new Date(firstAired);
  const releaseTimestamp = releaseDate.getTime();
  if (!Number.isFinite(releaseTimestamp)) return false;
  if (releaseDate.getUTCFullYear() < MIN_MEANINGFUL_YEAR) return false;

  return releaseTimestamp <= now;
}
