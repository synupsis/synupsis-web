import axios from 'axios';
import type { TvMazeSearchResult } from '~/types/tv-maze.types';

export default defineEventHandler(async event => {
  const { q: query } = getQuery(event);

  if (!query || typeof query !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Query parameter "q" is required'
    });
  }

  try {
    const { data: searchData } = await axios.get<TvMazeSearchResult[]>(
      `https://api.tvmaze.com/search/shows?q=${query}`
    );

    const shows = searchData
      .map(item => item.show)
      .filter(show => show.premiered)
      .map(show => ({
        id: show.id,
        name: show.name,
        premiered: show.premiered,
        ended: show.ended,
        image: show.image?.medium ?? null
      }));

    return shows;
  } catch (error: unknown) {
    console.error('Error searching for shows:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch shows from TVMaze API.'
    });
  }
});
