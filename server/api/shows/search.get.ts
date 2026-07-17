import axios from 'axios';

export default defineEventHandler(async event => {
  const { q: query } = getQuery(event);

  if (!query || typeof query !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Query parameter "q" is required'
    });
  }

  try {
    const clientId = process.env.TRAKT_CLIENT_ID;
    const url = `https://api.trakt.tv/search/show?query=${encodeURIComponent(query)}&extended=images`;

    const headers = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': clientId
    };

    const { data: searchData } = await axios.get(url, { headers });

    const shows = searchData
      .filter((item: any) => item.show && item.show.ids && item.show.title) // Ensure show and its basic info exist
      .map((item: any) => ({
        traktId: item.show.ids.trakt,
        slug: item.show.ids.slug,
        name: item.show.title,
        image: 'https://' + item.show.images?.poster[0]
      }));

    return shows;
  } catch (error: unknown) {
    console.error('Error searching for shows:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch shows from Trakt API.'
    });
  }
});
