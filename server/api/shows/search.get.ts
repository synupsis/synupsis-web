import axios from 'axios';
import { createTraktHeaders } from '~/server/utils/trakt';
import {
  escapeShowSearchQuery,
  mapShowSearchResults,
  normalizeShowSearchQuery,
  SHOW_SEARCH_LIMIT,
  SHOW_SEARCH_MAX_LENGTH,
} from '~/server/utils/show-search';

export default defineEventHandler(async event => {
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
    const { data } = await axios.get<unknown>('https://api.trakt.tv/search/show', {
      headers,
      params: {
        query: escapeShowSearchQuery(query),
        fields: 'title,original_title,translations,aliases',
        extended: 'full,images',
        limit: SHOW_SEARCH_LIMIT,
      },
      timeout: 8000,
    });
    if (!Array.isArray(data)) {
      throw new Error('Invalid show search response');
    }
    return mapShowSearchResults(data, query);
  } catch (error: unknown) {
    const upstreamStatus = axios.isAxiosError(error) ? error.response?.status : undefined;
    const timedOut = axios.isAxiosError(error) && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT');
    // Axios errors include request headers; do not log the API key.
    console.error('Show search failed', { upstreamStatus, timedOut });
    throw createError({
      statusCode: timedOut ? 504 : upstreamStatus === 429 ? 503 : 502,
      statusMessage: 'Show search is temporarily unavailable. Please try again.'
    });
  }
});
