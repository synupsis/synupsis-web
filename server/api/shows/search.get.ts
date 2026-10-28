import type { TraktShowCard } from '~/types/trakt.types';
import { createTraktHeaders } from '~/server/utils/trakt';
import {
  escapeShowSearchQuery,
  mapShowSearchResults,
  normalizeShowSearchQuery,
  SHOW_SEARCH_LIMIT,
  SHOW_SEARCH_MAX_LENGTH,
} from '~/server/utils/show-search';

// The explicit return type keeps Nitro's typed $fetch from referencing this handler.
export default defineEventHandler(async (event): Promise<TraktShowCard[]> => {
  const { q } = getQuery(event);

  if (typeof q !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Query parameter "q" is required'
    });
  }

  const query = normalizeShowSearchQuery(q);
  if (query.length > SHOW_SEARCH_MAX_LENGTH) {
    throw createError({
      statusCode: 400,
      statusMessage: `Search queries must be ${SHOW_SEARCH_MAX_LENGTH} characters or fewer`,
    });
  }
  if (query.length < 2) return [];

  const clientId = process.env.TRAKT_CLIENT_ID;
  if (!clientId) {
    throw createError({ statusCode: 503, statusMessage: 'Show search is temporarily unavailable.' });
  }

  try {
    const headers = createTraktHeaders(clientId);
    const data = await $fetch<unknown>('https://api.trakt.tv/search/show', {
      headers,
      query: {
        query: escapeShowSearchQuery(query),
        fields: 'title,original_title,translations,aliases',
        extended: 'full,images',
        limit: SHOW_SEARCH_LIMIT,
      },
      timeout: 8000,
      // Fail fast while the user is typing: a new query replaces this one.
      retry: 0,
    });
    if (!Array.isArray(data)) {
      throw new Error('Invalid show search response');
    }
    return mapShowSearchResults(data, query);
  } catch (error: unknown) {
    const fetchError = error as { statusCode?: number; cause?: { name?: string } } | undefined;
    const upstreamStatus = fetchError?.statusCode;
    const timedOut = fetchError?.cause?.name === 'TimeoutError';
    // Fetch errors include the request options; do not log the API key.
    console.error('Show search failed', { upstreamStatus, timedOut });
    throw createError({
      statusCode: timedOut ? 504 : upstreamStatus === 429 ? 503 : 502,
      statusMessage: 'Show search is temporarily unavailable. Please try again.'
    });
  }
});
