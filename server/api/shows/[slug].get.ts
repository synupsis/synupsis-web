import { serverSupabaseClient, SupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import type { TvMazeShow } from '~/types/tv-maze.types';
import axios from 'axios';

// Type definitions for clarity
type SeasonWithRecaps = Database['public']['Tables']['season']['Row'] & {
  recap: Database['public']['Tables']['recap']['Row'][];
};
type ShowWithSeasons = Database['public']['Tables']['show']['Row'] & {
  seasons: SeasonWithRecaps[];
};

// Fetches the show and its relations from our local database
async function getShowFromDb(supabase: SupabaseClient<Database>, tvMazeId: string) {
  const { data, error } = await supabase
    .from('show')
    .select('*, seasons:season(*, recap(*))')
    .eq('tv_maze_id', tvMazeId)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: `DB Error: ${error.message}` });
  return data as ShowWithSeasons | null;
}

// Creates the show and all its seasons in our database
async function createShowInDb(supabase: SupabaseClient<Database>, tvMazeShow: TvMazeShow) {
  const { id: tvMazeId, name, genres, image, summary, _embedded } = tvMazeShow;

  const { data: show, error: showError } = await supabase
    .from('show')
    .insert({ tv_maze_id: tvMazeId, name, language: 'en', genres, image: image?.original, summary })
    .select('id')
    .single();
  if (showError || !show) throw createError({ statusCode: 500, statusMessage: `Failed to create show: ${showError?.message}` });

  const seasonsToInsert = _embedded.seasons.map(s => ({
    tv_maze_id: s.id,
    name: s.name,
    number: s.number,
    show_id: show.id,
    image: s.image?.original,
  }));
  const { error: seasonsError } = await supabase.from('season').insert(seasonsToInsert);
  if (seasonsError) {
    await supabase.from('show').delete().eq('id', show.id); // Clean up
    throw createError({ statusCode: 500, statusMessage: `Failed to create seasons: ${seasonsError.message}` });
  }

  return getShowFromDb(supabase, tvMazeId.toString());
}

// Merges the rich data from TVMaze with our local DB data
function mergeShowData(tvMazeShow: TvMazeShow, dbShow: ShowWithSeasons | null): any {
  if (!dbShow) return tvMazeShow;

  const dbSeasonsByTvMazeId = new Map(dbShow.seasons.map(s => [s.tv_maze_id, s]));

  const seasons = tvMazeShow._embedded.seasons.map(tvMazeSeason => {
    const dbSeason = dbSeasonsByTvMazeId.get(tvMazeSeason.id);
    return {
      ...tvMazeSeason,
      id: dbSeason?.id ?? tvMazeSeason.id,
      recap: dbSeason?.recap ?? [],
    };
  });

  return {
    ...tvMazeShow,
    id: dbShow.id,
    image: tvMazeShow.image,
    seasons,
    _embedded: { cast: tvMazeShow._embedded.cast },
  };
}

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event);
  const slug = event.context.params?.slug;

  if (!slug) throw createError({ statusCode: 400, statusMessage: 'No slug provided' });
  const tvMazeId = slug.split('-').pop();
  if (!tvMazeId) throw createError({ statusCode: 400, statusMessage: 'Invalid slug format' });

  try {
    // 1. Always fetch fresh data from TVMaze
    const { data: tvMazeShow } = await axios.get<TvMazeShow>(`https://api.tvmaze.com/shows/${tvMazeId}?embed[]=seasons&embed[]=cast`);

    // 2. Get our local data
    let dbShow = await getShowFromDb(supabase, tvMazeId);

    // 3. If show doesn't exist, create it. If it exists, sync its seasons.
    if (!dbShow) {
      dbShow = await createShowInDb(supabase, tvMazeShow);
    } else {
      // Sync seasons: find seasons from TVMaze that are not in our DB and add them.
      const dbSeasonTvMazeIds = new Set(dbShow.seasons.map(s => s.tv_maze_id));
      const missingSeasons = tvMazeShow._embedded.seasons.filter(
        s => !dbSeasonTvMazeIds.has(s.id)
      );

      if (missingSeasons.length > 0) {
        const seasonsToInsert = missingSeasons.map(s => ({
          tv_maze_id: s.id,
          name: s.name,
          number: s.number,
          show_id: dbShow!.id,
          image: s.image?.original,
        }));
        await supabase.from('season').insert(seasonsToInsert);
        // Re-fetch to get the complete, updated show data
        dbShow = await getShowFromDb(supabase, tvMazeId);
      }
    }

    // 4. Merge the two data sources for the final response
    const show = mergeShowData(tvMazeShow, dbShow);

    return { show };
  } catch (error: any) {
    const statusMessage = error.response?.data?.message || error.message || 'An internal error occurred';
    const statusCode = error.response?.status || 500;
    throw createError({ statusCode, statusMessage });
  }
});