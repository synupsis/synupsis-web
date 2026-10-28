import type { RecapCoverArt } from '~/server/services/recap-generation/sources';
import { fetchTmdbCoverArt } from '~/server/services/recap-generation/sources';

// Read when a recap is opened, so recaps generated before the cover art existed
// get it too; posters and logos rarely change, so one lookup lasts a week.
export const getRecapCoverArt = defineCachedFunction(
  async (tmdbId: number, seasonNumber: number): Promise<RecapCoverArt | null> => fetchTmdbCoverArt({ tmdbId, seasonNumber }),
  {
    name: 'recap-cover-art',
    maxAge: 60 * 60 * 24 * 7,
    staleMaxAge: 60 * 60 * 24 * 30,
    swr: true,
    getKey: (tmdbId: number, seasonNumber: number) => `${tmdbId}:${seasonNumber}`,
  },
);
