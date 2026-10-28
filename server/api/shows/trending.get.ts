import type { TraktShowCard } from '~/types/trakt.types';
import { createTraktHeaders } from '~/server/utils/trakt';

type TraktShowImageSet = {
  poster?: string[];
};

type TraktShowIds = {
  trakt?: number;
  slug?: string;
};

type TraktShowPayload = {
  ids?: TraktShowIds;
  title?: string;
  images?: TraktShowImageSet;
};

type TraktShowEntry = {
  show?: TraktShowPayload;
};

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function mapTraktShow(entry: TraktShowEntry) {
  const show = entry.show;
  const traktId = show?.ids?.trakt;
  const slug = show?.ids?.slug;
  const name = show?.title;
  const poster = show?.images?.poster?.[0];

  if (!traktId || !slug || !name || !poster) {
    return null;
  }

  return {
    traktId,
    slug,
    name,
    image: `https://${poster}`,
  };
}

// The explicit return type keeps Nitro's typed $fetch from referencing this handler.
export default defineEventHandler(async (): Promise<TraktShowCard[]> => {
  try {
    const clientId = process.env.TRAKT_CLIENT_ID;
    const url = 'https://api.trakt.tv/shows/trending?extended=images';

    const headers = createTraktHeaders(clientId);

    const response = await $fetch<unknown>(url, { headers });
    const shows = Array.isArray(response) ? response : [];

    const trendingShows = shows
      .slice(0, 10)
      .map(mapTraktShow)
      .filter(isPresent);

    return trendingShows;
  } catch (error: unknown) {
    console.error('Failed to fetch trending shows from Trakt (primary):', error);

    try {
      const clientId = process.env.TRAKT_CLIENT_ID;
      const fallbackUrl = 'https://api.trakt.tv/shows/popular?extended=images';

      const headers = createTraktHeaders(clientId);

      const fallbackResponse = await $fetch<unknown>(fallbackUrl, { headers });
      const fallbackShows = Array.isArray(fallbackResponse) ? fallbackResponse : [];

      const popularShows = fallbackShows
        .slice(0, 10)
        .map(mapTraktShow)
        .filter(isPresent);

      return popularShows;
    } catch (fallbackError: unknown) {
      console.error('Failed to fetch popular shows from Trakt (fallback):', fallbackError);

      return [];
    }
  }
});
