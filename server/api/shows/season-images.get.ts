import { serverSupabaseClient } from '#supabase/server';
import { CompatibilityEvent } from 'h3';

export default defineEventHandler(async (event: CompatibilityEvent) => {
  const supabase = await serverSupabaseClient(event);
  const { seasonId } = getQuery(event);

  if (!seasonId) {
    return {
      statusCode: 400,
      body: {
        message: 'Season ID is required'
      }
    };
  }

  const { data: season, error } = await supabase
    .from('season')
    .select('tv_maze_id')
    .eq('id', seasonId)
    .single();

  if (error) {
    return {
      statusCode: 500,
      body: {
        message: 'Failed to fetch season',
        error
      }
    };
  }

  if (!season) {
    return {
      statusCode: 404,
      body: {
        message: 'Season not found'
      }
    };
  }

  try {
    const episodes = await $fetch(`https://api.tvmaze.com/seasons/${season.tv_maze_id}/episodes`);
    const images = episodes.map((episode: any) => episode.image).filter(Boolean);
    
    return {
      statusCode: 200,
      body: images
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: {
        message: 'Failed to fetch images from TVMaze',
        error: e
      }
    };
  }
});
