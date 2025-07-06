import { serverSupabaseClient, SupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import axios from 'axios';

// Type definitions for clarity
type SeasonWithRecaps = Database['public']['Tables']['season']['Row'] & {
  recap: Database['public']['Tables']['recap']['Row'][];
};
type ShowWithSeasons = Database['public']['Tables']['show']['Row'] & {
  seasons: SeasonWithRecaps[];
};

// Fetches the show and its relations from our local database
async function getShowFromDb(supabase: SupabaseClient<Database>, traktId: string) {
  const { data, error } = await supabase
    .from('show')
    .select('*, seasons:season(*, recap(*))')
    .eq('trakt_id', traktId)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: `DB Error: ${error.message}` });
  return data as ShowWithSeasons | null;
}

// Creates the show and all its seasons in our database
async function createShowInDb(supabase: SupabaseClient<Database>, traktShow: any) {
  const { ids, title, genres, overview, images } = traktShow;

  const { data: show, error: showError } = await supabase
    .from('show')
    .insert({
      trakt_id: ids.trakt,
      name: title,
      language: 'en',
      genres,
      image: images?.poster?.full,
      summary: overview
    })
    .select('id')
    .single();
  if (showError || !show) throw createError({ statusCode: 500, statusMessage: `Failed to create show: ${showError?.message}` });

  // Fetch seasons from Trakt for the newly created show
  const clientId = process.env.TRAKT_CLIENT_ID;
  const seasonsUrl = `https://api.trakt.tv/shows/${ids.trakt}/seasons?extended=full`;
  const headers = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': clientId
  };
  const { data: traktSeasons } = await axios.get(seasonsUrl, { headers });

  const seasonsToInsert = traktSeasons.map((s: any) => ({
    trakt_id: s.ids.trakt,
    name: s.title,
    number: s.number,
    show_id: show.id,
    image: s.images?.poster?.full,
  }));
  const { error: seasonsError } = await supabase.from('season').insert(seasonsToInsert);
  if (seasonsError) {
    await supabase.from('show').delete().eq('id', show.id); // Clean up
    throw createError({ statusCode: 500, statusMessage: `Failed to create seasons: ${seasonsError.message}` });
  }

  return getShowFromDb(supabase, ids.trakt.toString());
}

// Merges the rich data from Trakt with our local DB data
function mergeShowData(traktShow: any, dbShow: ShowWithSeasons | null): any {
  if (!dbShow) return traktShow;

  const dbSeasonsByTraktId = new Map(dbShow.seasons.map(s => [s.trakt_id, s]));

  const seasons = traktShow.seasons.map((traktSeason: any) => {
    const dbSeason = dbSeasonsByTraktId.get(traktSeason.ids.trakt);
    return {
      ...traktSeason,
      id: dbSeason?.id ?? traktSeason.ids.trakt,
      recap: dbSeason?.recap ?? [],
    };
  });

  return {
    ...traktShow,
    id: dbShow.id,
    image: traktShow.images?.poster?.full,
    seasons,
    _embedded: { cast: traktShow._embedded.cast }, // Assuming cast is added to _embedded
  };
}

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event);
  const slug = event.context.params?.slug;

  if (!slug) throw createError({ statusCode: 400, statusMessage: 'No slug provided' });
  const traktId = slug.split('-').pop();
  if (!traktId) throw createError({ statusCode: 400, statusMessage: 'Invalid slug format' });

  try {
    // 1. Always fetch fresh data from Trakt
    const clientId = process.env.TRAKT_CLIENT_ID;
    const traktUrl = `https://api.trakt.tv/shows/${traktId}?extended=full`;
    const headers = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': clientId
    };
    const { data: traktShow } = await axios.get(traktUrl, { headers });

    // Fetch cast separately as it's not in extended=full for shows
    const castUrl = `https://api.trakt.tv/shows/${traktId}/people`;
    const { data: traktCast } = await axios.get(castUrl, { headers });
    traktShow._embedded = { cast: traktCast.cast }; // Add cast to _embedded for compatibility with mergeShowData

    // 2. Get our local data
    let dbShow = await getShowFromDb(supabase, traktId);

    // 3. If show doesn't exist, create it. If it exists, sync its seasons.
    if (!dbShow) {
      dbShow = await createShowInDb(supabase, traktShow);
    } else {
      // Sync seasons: find seasons from Trakt that are not in our DB and add them.
      const dbSeasonTraktIds = new Set(dbShow.seasons.map(s => s.trakt_id));
      const missingSeasons = traktShow.seasons.filter(
        (s: any) => !dbSeasonTraktIds.has(s.ids.trakt)
      );

      if (missingSeasons.length > 0) {
        const seasonsToInsert = missingSeasons.map((s: any) => ({
          trakt_id: s.ids.trakt,
          name: s.title,
          number: s.number,
          show_id: dbShow!.id,
          image: s.images?.poster?.full,
        }));
        await supabase.from('season').insert(seasonsToInsert);
        // Re-fetch to get the complete, updated show data
        dbShow = await getShowFromDb(supabase, traktId);
      }
    }

    // 4. Merge the two data sources for the final response
    const show = mergeShowData(traktShow, dbShow);

    return { show };
  } catch (error: any) {
    const statusMessage = error.response?.data?.message || error.message || 'An internal error occurred';
    const statusCode = error.response?.status || 500;
    throw createError({ statusCode, statusMessage });
  }
});