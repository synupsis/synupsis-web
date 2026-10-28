import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '~/types/database.types';
import type { ShowCharacterProfile } from '~/types/show-character.types';
import type { TvMazeLookup } from '~/server/services/tvmaze-character-cast';
import {
  selectTvMazeLookup,
  toTvMazeCharacterProfiles,
} from '~/server/services/tvmaze-character-cast';
import { createTraktHeaders } from '~/server/utils/trakt';

const getTvMazeCharacterProfiles = defineCachedFunction(
  async (lookup: TvMazeLookup): Promise<ShowCharacterProfile[]> => {
    const lookupUrl = new URL('https://api.tvmaze.com/lookup/shows');
    lookupUrl.searchParams.set(lookup.type, lookup.value);
    const requestConfig = {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Synupsis character timeline',
      },
      timeout: 8_000,
    };
    const tvMazeShow = await $fetch<{ id?: number }>(lookupUrl.toString(), requestConfig);
    if (!Number.isInteger(tvMazeShow?.id)) return [];

    const tvMazeCast = await $fetch<unknown>(
      `https://api.tvmaze.com/shows/${tvMazeShow.id}/cast`,
      requestConfig,
    );
    return toTvMazeCharacterProfiles(tvMazeCast);
  },
  {
    name: 'tvmaze-character-profiles',
    maxAge: 60 * 60 * 24 * 7,
    staleMaxAge: 60 * 60 * 24 * 30,
    swr: true,
    getKey: (lookup: TvMazeLookup) => `${lookup.type}:${lookup.value}`,
  },
);

// Type definitions for clarity
type SeasonWithRecaps = Database['public']['Tables']['season']['Row'] & {
  recap: Database['public']['Tables']['recap']['Row'][];
};
type ShowWithSeasons = Database['public']['Tables']['show']['Row'] & {
  seasons: SeasonWithRecaps[];
};

// Fetches the show and its relations from our local database
async function getShowFromDb(supabase: SupabaseClient<Database>, traktId: number) {
  const { data, error } = await supabase
    .from('show')
    .select('*, seasons:season(*, recap(*))')
    .eq('trakt_id', traktId)
    // Season cards open the first published recap: list the newest format first,
    // then its canonical version, then the latest generation.
    .order('format_version', { referencedTable: 'seasons.recap', ascending: false })
    .order('is_canonical', { referencedTable: 'seasons.recap', ascending: false })
    .order('created_at', { referencedTable: 'seasons.recap', ascending: false })
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: `DB Error: ${error.message}` });
  return data as ShowWithSeasons | null;
}

// Creates the show and all its seasons from Trakt. Clients may only read
// these tables: the server writes them with the service role.
async function createShowInDb(supabase: SupabaseClient<Database>, traktShow: any) {
  const { ids, title, genres, overview, images } = traktShow;

  const { data: show, error: showError } = await supabase
    .from('show')
    .insert({
      trakt_id: ids.trakt,
      name: title,
      language: 'en',
      genres,
      image: 'https://' + (images?.fanart[0] ?? images?.poster[0]),
      summary: overview
    })
    .select('id')
    .single();
  if (showError || !show) throw createError({ statusCode: 500, statusMessage: `Failed to create show: ${showError?.message}` });

  // Fetch seasons from Trakt for the newly created show
  const clientId = process.env.TRAKT_CLIENT_ID;
  const seasonsUrl = `https://api.trakt.tv/shows/${ids.trakt}/seasons?extended=full,images`;
  const headers = createTraktHeaders(clientId);
  const traktSeasons = await $fetch<any[]>(seasonsUrl, { headers });

  const seasonsToInsert = traktSeasons.map((s: any) => ({
    trakt_id: s.ids.trakt,
    name: s.title,
    number: s.number,
    show_id: show.id,
    image: 'https://' + s.images?.poster[0],
    first_aired: s.first_aired,
  }));
  const { error: seasonsError } = await supabase.from('season').insert(seasonsToInsert);
  if (seasonsError) {
    await supabase.from('show').delete().eq('id', show.id); // Clean up
    throw createError({ statusCode: 500, statusMessage: `Failed to create seasons: ${seasonsError.message}` });
  }

  return show.id;
}

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event);
  const slug = event.context.params?.slug;

  if (!slug) throw createError({ statusCode: 400, statusMessage: 'No slug provided' });
  const rawTraktId = slug.split('-').pop();
  const traktId = Number(rawTraktId);
  if (!rawTraktId || !Number.isInteger(traktId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug format' });
  }

  try {
    let show: ShowWithSeasons | null = null;
    let cast: any[] = [];
    let traktShowDetails: any = null;

    // 1. Try to get show from our local database
    const dbShow = await getShowFromDb(supabase, traktId);

    if (dbShow) {
      show = dbShow;
    } else {
      // 2. If not in DB, fetch from Trakt and create in DB
      const clientId = process.env.TRAKT_CLIENT_ID;
      const headers = createTraktHeaders(clientId);

      const traktUrl = `https://api.trakt.tv/shows/${traktId}?extended=full,images`;
      const traktShow = await $fetch<any>(traktUrl, { headers });
      traktShowDetails = traktShow;

      await createShowInDb(serverSupabaseServiceRole<Database>(event), traktShow);
      show = await getShowFromDb(supabase, traktId); // Re-fetch to get full object with seasons and recaps
    }

    // 3. Always fetch cast from Trakt (as it's not stored in DB with show details)
    const clientId = process.env.TRAKT_CLIENT_ID;
    const headers = createTraktHeaders(clientId);
    const castUrl = `https://api.trakt.tv/shows/${traktId}/people?extended=images`;
    const showDetailsRequest = traktShowDetails
      ? Promise.resolve(traktShowDetails)
      : $fetch<any>(`https://api.trakt.tv/shows/${traktId}?extended=full`, { headers })
          .catch((error) => {
            console.warn(`Unable to retrieve external show identifiers for Trakt ${traktId}:`, error.message);
            return null;
          });
    const [traktCast, resolvedShowDetails] = await Promise.all([
      $fetch<any>(castUrl, { headers }),
      showDetailsRequest,
    ]);
    cast = Array.isArray(traktCast?.cast) ? traktCast.cast : [];

    let characterProfiles: ShowCharacterProfile[] = [];
    const tvMazeLookup = selectTvMazeLookup(resolvedShowDetails?.ids);
    if (tvMazeLookup) {
      try {
        characterProfiles = await getTvMazeCharacterProfiles(tvMazeLookup);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`TVMaze character enrichment failed for Trakt ${traktId}:`, message);
      }
    }

    // Trakt's community rating, out of 10; missing when Trakt is unreachable.
    const ratingValue = Number(resolvedShowDetails?.rating);
    const ratingVotes = Number(resolvedShowDetails?.votes);
    const rating = Number.isFinite(ratingValue) && ratingValue > 0 && ratingValue <= 10 && ratingVotes > 0
      ? { value: ratingValue, votes: ratingVotes }
      : null;

    // Add cast to the show object before returning
    if (show) {
      (show as any)._embedded = { cast, characterProfiles, rating };
    }

    return { show };
  } catch (error: any) {
    // Upstream FetchErrors and our own H3 errors both carry statusCode.
    const statusMessage = error.data?.message || error.statusMessage || error.message || 'An internal error occurred';
    const statusCode = error.statusCode || 500;
    throw createError({ statusCode, statusMessage });
  }
});
