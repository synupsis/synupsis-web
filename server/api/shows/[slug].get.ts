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
      image: 'https://' + (images?.fanart[0] ?? images?.poster[0]),
      summary: overview
    })
    .select('id')
    .single();
  if (showError || !show) throw createError({ statusCode: 500, statusMessage: `Failed to create show: ${showError?.message}` });

  // Fetch seasons from Trakt for the newly created show
  const clientId = process.env.TRAKT_CLIENT_ID;
  const seasonsUrl = `https://api.trakt.tv/shows/${ids.trakt}/seasons?extended=full,images`;
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
  const traktId = slug.split('-').pop();
  if (!traktId) throw createError({ statusCode: 400, statusMessage: 'Invalid slug format' });

  try {
    let show: ShowWithSeasons | null = null;
    let cast: any[] = [];

    // 1. Try to get show from our local database
    const dbShow = await getShowFromDb(supabase, traktId);

    if (dbShow) {
      show = dbShow;
    } else {
      // 2. If not in DB, fetch from Trakt and create in DB
      const clientId = process.env.TRAKT_CLIENT_ID;
      const headers = {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': clientId
      };

      const traktUrl = `https://api.trakt.tv/shows/${traktId}?extended=full,images`;
      const { data: traktShow } = await axios.get(traktUrl, { headers });

      const newShowId = await createShowInDb(supabase, traktShow);
      show = await getShowFromDb(supabase, traktId); // Re-fetch to get full object with seasons and recaps
    }

    // 3. Always fetch cast from Trakt (as it's not stored in DB with show details)
    const clientId = process.env.TRAKT_CLIENT_ID;
    const headers = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': clientId
    };
    const castUrl = `https://api.trakt.tv/shows/${traktId}/people?extended=images`;
    const { data: traktCast } = await axios.get(castUrl, { headers });
    cast = traktCast.cast; // Assign cast data
    // Add cast to the show object before returning
    if (show) {
      (show as any)._embedded = { cast };
    }

    return { show };
  } catch (error: any) {
    const statusMessage = error.response?.data?.message || error.message || 'An internal error occurred';
    const statusCode = error.response?.status || 500;
    throw createError({ statusCode, statusMessage });
  }
});