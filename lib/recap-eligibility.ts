/** Stable English messages are translated by the interface, including API refusals. */
export const RECAP_ELIGIBILITY_MESSAGES = {
  eligible: 'All episodes of this season have aired.',
  season_in_progress: 'This season is still airing. A recap can only be created after all episodes have aired.',
  not_yet_aired: 'This season has not aired yet.',
  metadata_incomplete: 'Episode information is incomplete. We cannot confirm that this season has fully aired yet.',
  metadata_inconsistent: 'Episode information is inconsistent. Recap creation is paused until it can be verified.',
  availability_unavailable: 'Episode availability could not be checked. Please try again later.',
  special_season: 'Recaps are not available for special seasons.',
  insufficient_sources: 'There are not enough detailed sources to create a reliable recap for this season.',
  finale_source_missing: 'The final episode does not have enough detailed sources to create a reliable season recap.',
  source_rights_restricted: 'The available sources cannot be used to create this recap.',
} as const;

export type RecapEligibilityCode = keyof typeof RECAP_ELIGIBILITY_MESSAGES;
export type RecapEligibility = {
  eligible: boolean;
  code: RecapEligibilityCode;
  message: string;
};

export function recapEligibility(code: RecapEligibilityCode): RecapEligibility {
  return { eligible: code === 'eligible', code, message: RECAP_ELIGIBILITY_MESSAGES[code] };
}

/**
 * Evaluate a season, never the lifetime of its show. Use the unfiltered episode
 * list and fresh season totals: a premiere date alone cannot prove completion.
 * This establishes release according to the catalogue, not regional streaming
 * availability or episodes that have not yet been announced by the provider.
 */
export function evaluateSeasonRecapEligibility(input: {
  seasonNumber: number;
  season?: unknown;
  episodes?: unknown;
  now?: number;
}): RecapEligibility {
  if (input.seasonNumber === 0) return recapEligibility('special_season');
  if (!Number.isInteger(input.seasonNumber) || input.seasonNumber < 1) {
    return recapEligibility('metadata_inconsistent');
  }
  const now = input.now ?? Date.now();
  if (!Number.isFinite(now)) return recapEligibility('availability_unavailable');
  if (!isRecord(input.season) || !Array.isArray(input.episodes)) {
    return recapEligibility('metadata_incomplete');
  }
  const season = input.season;
  if (season.number !== input.seasonNumber) return recapEligibility('metadata_inconsistent');
  const expectedCount = season.episode_count;
  if (expectedCount == null || expectedCount === 0 || input.episodes.length === 0) {
    return recapEligibility('metadata_incomplete');
  }
  if (typeof expectedCount !== 'number' || !Number.isInteger(expectedCount) || expectedCount < 1) {
    return recapEligibility('metadata_inconsistent');
  }
  if (input.episodes.length !== expectedCount) return recapEligibility('metadata_inconsistent');

  const episodes = input.episodes;
  if (!episodes.every(isRecord)) return recapEligibility('metadata_incomplete');
  const numbers = episodes.map(episode => episode.number);
  if (numbers.some(number => typeof number !== 'number' || !Number.isInteger(number) || number < 1 || number > expectedCount)
    || new Set(numbers).size !== expectedCount
    || episodes.some(episode => episode.season != null && episode.season !== input.seasonNumber)) {
    return recapEligibility('metadata_inconsistent');
  }

  const timestamps = episodes.map(episode => parseRecapReleaseTimestamp(episode.first_aired));
  if (timestamps.some(timestamp => timestamp === null)) return recapEligibility('metadata_incomplete');
  const releaseTimes = timestamps as number[];
  const seasonRelease = season.first_aired == null ? null : parseRecapReleaseTimestamp(season.first_aired);
  if (season.first_aired != null && seasonRelease === null) return recapEligibility('metadata_incomplete');
  // The season cannot premiere after one of its episodes has already aired.
  if (seasonRelease !== null && releaseTimes.some(timestamp => timestamp < seasonRelease)) {
    return recapEligibility('metadata_inconsistent');
  }

  const airedCount = releaseTimes.filter(timestamp => timestamp <= now).length;
  const reportedAiredCount = season.aired_episodes;
  if (reportedAiredCount != null && (typeof reportedAiredCount !== 'number'
    || !Number.isInteger(reportedAiredCount) || reportedAiredCount < 0 || reportedAiredCount > expectedCount
    || reportedAiredCount !== airedCount)) {
    return recapEligibility('metadata_inconsistent');
  }
  if (airedCount === 0) return recapEligibility('not_yet_aired');
  if (airedCount < expectedCount) return recapEligibility('season_in_progress');
  // An explicitly marked part-one finale does not finish the season, even if
  // the remaining episodes have not received catalogue entries yet.
  if (episodes.find(episode => episode.number === expectedCount)?.episode_type === 'mid_season_finale') {
    return recapEligibility('season_in_progress');
  }
  return recapEligibility('eligible');
}

/** Date-only or timezone-less dates cannot prove an episode has aired now. */
export function parseRecapReleaseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = parts;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  if (year! < 1900 || month! < 1 || month! > 12 || day! < 1 || day! > 31
    || hour! > 23 || minute! > 59 || second! > 59) return null;
  const calendar = new Date(Date.UTC(year!, month! - 1, day!));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month! - 1 || calendar.getUTCDate() !== day) return null;
  if (zone !== 'Z') {
    const offsetHour = Number(zone!.slice(1, 3));
    const offsetMinute = Number(zone!.slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
