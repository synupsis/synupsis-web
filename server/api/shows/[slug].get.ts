import { serverSupabaseClient, SupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import type { TvMazeShow } from '~/types/tv-maze.types';
import axios from 'axios';

async function getShowFromDb(supabase: SupabaseClient<Database>, tvMazeId: string) {
  const { data: existingShow, error } = await supabase
    .from('show')
    .select('*, seasons:season(*)')
    .eq('tv_maze_id', tvMazeId)
    .maybeSingle();

  if (error) {
    console.error('Error getting show from DB:', error);
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return existingShow;
}

async function createShowInDb(supabase: SupabaseClient<Database>, tvMazeShow: TvMazeShow) {
  const { id: tvMazeId, name, genres, image, summary, _embedded } = tvMazeShow;

  const { data: createdShow, error: createShowError } = await supabase
    .from('show')
    .insert({ tv_maze_id: tvMazeId, name, language: 'en', genres, image: image?.original, summary })
    .select()
    .single();

  if (createShowError) {
    console.error('Error creating show in DB:', createShowError);
    throw createError({ statusCode: 500, statusMessage: createShowError.message });
  }

  const seasonsToInsert = _embedded.seasons.map(season => ({
    tv_maze_id: season.id,
    name: season.name,
    number: season.number,
    show_id: createdShow.id,
  }));

  const { data: createdSeasons, error: createSeasonsError } = await supabase
    .from('season')
    .insert(seasonsToInsert)
    .select();

  if (createSeasonsError) {
    console.error('Error creating seasons in DB:', createSeasonsError);
    // Note: You might want to handle this more gracefully, e.g., by deleting the created show
    throw createError({ statusCode: 500, statusMessage: createSeasonsError.message });
  }

  return { ...createdShow, seasons: createdSeasons || [] };
}

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event);
  const slug = event.context.params?.slug;

  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'No slug provided' });
  }

  const tvMazeId = slug.split('-').pop();
  if (!tvMazeId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug format' });
  }

  try {
    let show = await getShowFromDb(supabase, tvMazeId);

    if (!show) {
      const { data: tvMazeShow } = await axios.get<TvMazeShow>(`https://api.tvmaze.com/shows/${tvMazeId}?embed=seasons`);
      show = await createShowInDb(supabase, tvMazeShow);
    }

    return { show };
  } catch (error: unknown) {
    console.error('Failed to get or create show:', error);
    // Ensure we don't leak sensitive error details
    throw createError({ statusCode: 500, statusMessage: 'An internal error occurred' });
  }
});
