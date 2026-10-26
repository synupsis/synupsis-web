import axios from 'axios';
import { createTraktHeaders } from '~/server/utils/trakt';

type TraktEpisode = {
  number?: unknown;
  title?: unknown;
  first_aired?: unknown;
};

export default defineCachedEventHandler(async (event) => {
  const slug = event.context.params?.slug;
  const seasonNumber = Number(event.context.params?.number);
  const traktId = Number(slug?.split('-').pop());

  if (!slug || !Number.isInteger(traktId) || !Number.isInteger(seasonNumber) || seasonNumber <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid show or season.' });
  }

  const clientId = process.env.TRAKT_CLIENT_ID;
  if (!clientId) {
    throw createError({ statusCode: 503, statusMessage: 'Episode information is temporarily unavailable.' });
  }

  try {
    const { data } = await axios.get<TraktEpisode[]>(
      `https://api.trakt.tv/shows/${traktId}/seasons/${seasonNumber}?extended=full`,
      {
        headers: createTraktHeaders(clientId),
        timeout: 10_000,
      },
    );

    const now = Date.now();
    const episodes = (Array.isArray(data) ? data : [])
      .map((episode) => {
        const number = Number(episode.number);
        const firstAired = typeof episode.first_aired === 'string' ? episode.first_aired : null;
        return {
          number,
          title: typeof episode.title === 'string' && episode.title.trim()
            ? episode.title.trim()
            : `Épisode ${number}`,
          firstAired,
        };
      })
      .filter(episode => Number.isInteger(episode.number) && episode.number > 0)
      .filter((episode) => {
        if (!episode.firstAired) return true;
        const releaseTime = new Date(episode.firstAired).getTime();
        return Number.isNaN(releaseTime) || releaseTime <= now;
      })
      .sort((a, b) => a.number - b.number);

    return {
      seasonNumber,
      episodes,
      totalEpisodes: episodes.reduce((maximum, episode) => Math.max(maximum, episode.number), 0),
    };
  } catch (cause: any) {
    const statusCode = Number(cause.response?.status);
    throw createError({
      statusCode: Number.isInteger(statusCode) && statusCode >= 400 ? statusCode : 502,
      statusMessage: 'Could not load the episodes for this season.',
    });
  }
}, {
  maxAge: 60 * 60 * 6,
  swr: true,
  name: 'trakt-season-episodes',
  getKey: event => `${event.context.params?.slug}:${event.context.params?.number}`,
});
