import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { isRegularSeasonReleased } from '~/lib/season-availability';
import { mergeSeasonCasts, toSeasonCast, type SeasonCastMember } from '~/server/services/trakt-season-cast';
import { createTraktHeaders } from '~/server/utils/trakt';

// A season's cast barely changes once aired: a week of cache keeps the page fast.
// Trakt's answer is cached as it is, so a change in how it is read applies at once.
const getSeasonCast = defineCachedFunction(
  (traktId: number, season: number): Promise<unknown> => $fetch<unknown>(
    `https://api.trakt.tv/shows/${traktId}/seasons/${season}/people?extended=images`,
    { headers: createTraktHeaders(process.env.TRAKT_CLIENT_ID), timeout: 8_000 },
  ),
  {
    name: 'trakt-season-cast-raw',
    maxAge: 60 * 60 * 24 * 7,
    staleMaxAge: 60 * 60 * 24 * 30,
    swr: true,
    getKey: (traktId: number, season: number) => `${traktId}:${season}`,
  },
);

// The series' characters from its cast, not its recaps: a series without any
// recap has characters too. Each comes with their episodes season by season,
// so the page shows only the seasons the viewer has reached, at once.
export default defineEventHandler(async (event) => {
  const traktId = Number(event.context.params?.slug?.split('-').pop());
  if (!Number.isInteger(traktId) || traktId <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid show.' });

  const client = await serverSupabaseClient<Database>(event);
  const { data: show, error } = await client.from('show')
    .select('id, seasons:season(number, first_aired)')
    .eq('trakt_id', traktId)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not load this show.' });
  if (!show) throw createError({ statusCode: 404, statusMessage: 'Show not found.' });

  const seasons = (show.seasons ?? [])
    .filter(season => isRegularSeasonReleased(season.number, season.first_aired))
    .map(season => season.number);
  const casts = await Promise.all(seasons.map(async season => ({
    season,
    cast: await getSeasonCast(traktId, season).then(toSeasonCast, (cause): SeasonCastMember[] => {
      console.warn(`Trakt cast of season ${season} unavailable for ${traktId}:`, cause instanceof Error ? cause.message : cause);
      return [];
    }),
  })));
  // Guests seen once in the whole series never make the list: no need to send them.
  const characters = mergeSeasonCasts(casts)
    .filter(character => Object.values(character.episodesBySeason).reduce((total, episodes) => total + episodes, 0) >= 2
      || Object.keys(character.episodesBySeason).length === seasons.length);
  return { characters };
});
