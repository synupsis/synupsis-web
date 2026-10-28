import { resolveWatchedEpisode } from '~/server/utils/episode-comments';

// Shown on the comments button, before the comments themselves are opened.
export default defineEventHandler(async (event) => {
  const { client, showId, season, episode } = await resolveWatchedEpisode(event);
  const { count, error } = await client.from('episode_comment')
    .select('id', { count: 'exact', head: true })
    .eq('show_id', showId)
    .eq('season', season)
    .eq('episode', episode);
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not load the comments.' });
  return { count: count ?? 0 };
});
