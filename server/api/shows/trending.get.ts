import axios from 'axios';
import type { TvMazeShow } from '~/types/tv-maze.types';

// This function fetches the schedule for the current day to get trending shows.
export default defineEventHandler(async event => {
  try {
    const clientId = process.env.TRAKT_CLIENT_ID; // Remplacez par votre vrai Client ID
    const url = 'https://api.trakt.tv/shows/trending?extended=images';

    const headers = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': clientId
    };

    const response = await axios.get(url, { headers });
    const shows = response.data;

    // Return a limited number of unique shows
    const trendingShows = Array.from(shows.values())
      .slice(0, 10)
      .map((trendingShow: any) => ({
        id: trendingShow.show.ids.trakt,
        name: trendingShow.show.title,
        image: 'https://' + trendingShow.show.images.poster[0],
        slug: trendingShow.show.ids.slug,
      }));

    return trendingShows;
  } catch (error: any) {
    console.error('Failed to fetch trending shows:', error);
    // Fallback to a static list in case the schedule API fails
    const fallbackIds = [169, 82, 2993, 139, 431];
    const showPromises = fallbackIds.map(id =>
      axios.get<TvMazeShow>(`https://api.tvmaze.com/shows/${id}`)
    );
    const showResponses = await Promise.all(showPromises);
    return showResponses.map(res => res.data);
  }
});
