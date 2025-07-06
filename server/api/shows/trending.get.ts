import axios from 'axios';

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
    console.error('Failed to fetch trending shows from Trakt (primary):', error);
    // Fallback to Trakt popular shows if trending fails
    try {
      const clientId = process.env.TRAKT_CLIENT_ID;
      const fallbackUrl = 'https://api.trakt.tv/shows/popular?extended=images'; // Using popular as fallback

      const headers = {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': clientId
      };

      const fallbackResponse = await axios.get(fallbackUrl, { headers });
      const fallbackShows = fallbackResponse.data;

      const popularShows = Array.from(fallbackShows.values())
        .slice(0, 10)
        .map((popularShow: any) => ({
          id: popularShow.show.ids.trakt,
          name: popularShow.show.title,
          image: 'https://' + popularShow.show.images.poster[0],
          slug: popularShow.show.ids.slug,
        }));
      return popularShows;
    } catch (fallbackError: any) {
      console.error('Failed to fetch popular shows from Trakt (fallback):', fallbackError);
      // If both fail, return an empty array
      return [];
    }
  }
});
