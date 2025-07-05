import axios from 'axios';
import type { TvMazeShow } from '~/types/tv-maze.types';

// This function fetches the schedule for the current day to get trending shows.
export default defineEventHandler(async (event) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // Get date in YYYY-MM-DD format
    const scheduleUrl = `https://api.tvmaze.com/schedule?country=US&date=${today}`;

    const response = await axios.get(scheduleUrl);
    const scheduleItems = response.data;

    // Use a Map to get unique shows, as a show might air multiple times.
    const uniqueShows = new Map<number, TvMazeShow>();
    for (const item of scheduleItems) {
      if (item.show && !uniqueShows.has(item.show.id)) {
        uniqueShows.set(item.show.id, item.show);
      }
    }

    // Return a limited number of unique shows
    const trendingShows = Array.from(uniqueShows.values()).slice(0, 10);

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