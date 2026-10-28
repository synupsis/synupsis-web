import { EPISODE_COMMENT_COLUMNS, resolveWatchedEpisode, toEpisodeComment } from '~/server/utils/episode-comments';

// Newest conversations first, each with its replies: the latest reactions are
// the ones a viewer just back from the episode wants.
export default defineEventHandler(async (event) => {
  const { client, user, showId, season, episode } = await resolveWatchedEpisode(event);
  const { data, error } = await client.from('episode_comment')
    .select(EPISODE_COMMENT_COLUMNS)
    .eq('show_id', showId)
    .eq('season', season)
    .eq('episode', episode)
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('Could not load episode comments:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not load the comments.' });
  }
  return { comments: (data ?? []).map(row => toEpisodeComment(row as any, user.sub)) };
});
