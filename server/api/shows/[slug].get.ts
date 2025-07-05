import { serverSupabaseClient, SupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import type { TvMazeShow } from '~/types/tv-maze.types';
import axios from 'axios';

async function getShowFromDb(supabase: SupabaseClient<Database>, tvMazeId: string) {
  const { data, error } = await supabase
    .from('show')
    .select('*, seasons:season(*, recap(*))')
    .eq('tv_maze_id', tvMazeId)
    .maybeSingle();

  if (error) {
    console.error('Error getting show from DB:', error);
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return data;
}

async function createShowInDb(supabase: SupabaseClient<Database>, tvMazeShow: TvMazeShow) {
  const { id: tvMazeId, name, genres, image, summary, _embedded } = tvMazeShow;

  // 1. Create the show
  const { data: createdShow, error: createShowError } = await supabase
    .from('show')
    .insert({ tv_maze_id: tvMazeId, name, language: 'en', genres, image: image?.original, summary })
    .select('id')
    .single();

  if (createShowError || !createdShow) {
    console.error('Error creating show in DB:', createShowError);
    throw createError({ statusCode: 500, statusMessage: createShowError?.message ?? 'Failed to create show' });
  }

  // 2. Create the seasons for the new show
  const seasonsToInsert = _embedded.seasons.map(season => ({
    tv_maze_id: season.id,
    name: season.name,
    number: season.number,
    show_id: createdShow.id,
  }));

  const { error: createSeasonsError } = await supabase
    .from('season')
    .insert(seasonsToInsert);

  if (createSeasonsError) {
    console.error('Error creating seasons in DB:', createSeasonsError);
    await supabase.from('show').delete().eq('id', createdShow.id);
    throw createError({ statusCode: 500, statusMessage: createSeasonsError.message });
  }

  // 3. Re-fetch the complete show data from our DB
  return getShowFromDb(supabase, tvMazeId.toString());
}

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event);
  const slug = event.context.params?.slug;

  if (!slug) throw createError({ statusCode: 400, statusMessage: 'No slug provided' });
  const tvMazeId = slug.split('-').pop();
  if (!tvMazeId) throw createError({ statusCode: 400, statusMessage: 'Invalid slug format' });

  try {
    let dbShow = await getShowFromDb(supabase, tvMazeId);

    // If the show exists but has no seasons, the data is incomplete.
    // We'll attempt to create the missing seasons to self-heal the data.
    if (dbShow && (!dbShow.seasons || dbShow.seasons.length === 0)) {
      console.warn(`Inconsistent data: Show ${tvMazeId} found but has no seasons. Attempting to create them.`);
      const { data: tvMazeShow } = await axios.get<TvMazeShow>(`https://api.tvmaze.com/shows/${tvMazeId}?embed=seasons`);
      
      const seasonsToInsert = tvMazeShow._embedded.seasons.map(season => ({
        tv_maze_id: season.id,
        name: season.name,
        number: season.number,
        show_id: dbShow.id, // Use the existing show's ID
      }));

      const { error } = await supabase.from('season').insert(seasonsToInsert);

      if (error) {
        // This might fail if seasons already exist but the relationship was broken, or due to a race condition.
        // We can log the error but continue, as the re-fetch below is the most important step.
        console.error("Error trying to create missing seasons:", error.message);
      }
      
      // After attempting to create, re-fetch the data to get the complete picture.
      dbShow = await getShowFromDb(supabase, tvMazeId);
    } else if (!dbShow) {
      // If the show doesn't exist at all, create it fully.
      const { data: tvMazeShow } = await axios.get<TvMazeShow>(`https://api.tvmaze.com/shows/${tvMazeId}?embed=seasons`);
      dbShow = await createShowInDb(supabase, tvMazeShow);
    }

    return { show: dbShow };
  } catch (error: any) {
    console.error('Failed to get or create show:', error);
    const statusMessage = error.response?.data?.message || error.message || 'An internal error occurred';
    const statusCode = error.response?.status || 500;
    throw createError({ statusCode, statusMessage });
  }
});