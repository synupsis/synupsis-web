import { createError } from 'h3';
import {
  evaluateSeasonRecapEligibility,
  recapEligibility,
  type RecapEligibility,
} from '~/lib/recap-eligibility';
import { createTraktHeaders } from '~/server/utils/trakt';

export type RecapTraktData = {
  episodes: any[];
  show: any;
  seasons: any[];
};

export type SeasonRecapAvailability = {
  eligibility: RecapEligibility;
  traktData?: RecapTraktData;
};

/** Fresh reads only: no database writes, source enrichment, tickets or AI. */
export async function fetchSeasonRecapAvailability(
  showTraktId: number | null,
  seasonNumber: number,
): Promise<SeasonRecapAvailability> {
  if (seasonNumber === 0) return { eligibility: recapEligibility('special_season') };
  if (showTraktId === null || !Number.isInteger(showTraktId) || showTraktId <= 0) {
    return { eligibility: recapEligibility('availability_unavailable') };
  }
  if (!Number.isInteger(seasonNumber) || seasonNumber < 1) {
    return { eligibility: recapEligibility('metadata_inconsistent') };
  }
  const clientId = process.env.TRAKT_CLIENT_ID;
  if (!clientId) return { eligibility: recapEligibility('availability_unavailable') };
  try {
    const request = { headers: createTraktHeaders(clientId), timeout: 15_000 };
    const base = `https://api.trakt.tv/shows/${showTraktId}`;
    const [episodes, show, seasons] = await Promise.all([
      $fetch<unknown>(`${base}/seasons/${seasonNumber}?extended=full`, request),
      $fetch<unknown>(`${base}?extended=full`, request),
      $fetch<unknown>(`${base}/seasons?extended=full`, request),
    ]);
    if (!Array.isArray(seasons) || !Array.isArray(episodes)
      || typeof show !== 'object' || show === null || Array.isArray(show)) {
      return { eligibility: recapEligibility('metadata_incomplete') };
    }
    const matchingSeasons = seasons.filter(season => season?.number === seasonNumber);
    if (matchingSeasons.length > 1) return { eligibility: recapEligibility('metadata_inconsistent') };
    const eligibility = evaluateSeasonRecapEligibility({ seasonNumber, season: matchingSeasons[0], episodes });
    return { eligibility, traktData: { episodes, show, seasons } };
  } catch {
    // A provider outage must not silently approve from stale local metadata.
    return { eligibility: recapEligibility('availability_unavailable') };
  }
}

export function assertRecapEligible(eligibility: RecapEligibility): void {
  if (eligibility.eligible) return;
  throw createError({
    statusCode: eligibility.code === 'availability_unavailable' ? 503 : 422,
    statusMessage: eligibility.message,
    data: { code: 'recap_ineligible', eligibility },
  });
}
