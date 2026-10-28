import { EPISODE_COMMENT_COLUMNS, resolveShowForComments, toEpisodeComment } from '~/server/utils/episode-comments';
import type { ShowFeedComment } from '~/types/episode-comment.types';

const PAGE_SIZE = 20;
// Likes are rows of their own, not a column to sort on: the feed ranks the
// series' latest comments here, which is plenty for one series.
const RANKED_COMMENTS = 500;

// Every episode's comments in one feed, the most liked first, then the newest.
// Row security keeps the episodes the viewer has not watched out of it, so the
// feed spoils nothing.
export default defineEventHandler(async (event) => {
  const { client, user, showId } = await resolveShowForComments(event);
  const offset = Math.max(0, Number.parseInt(String(getQuery(event).offset ?? 0), 10) || 0);
  const { data, error } = await client.from('episode_comment')
    .select(`${EPISODE_COMMENT_COLUMNS}, season, episode`)
    .eq('show_id', showId)
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .limit(RANKED_COMMENTS);
  if (error) {
    console.error('Could not load the show comments:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not load the comments.' });
  }
  const ranked = (data ?? [])
    .map((row: any): ShowFeedComment => ({ season: row.season, episode: row.episode, comment: toEpisodeComment(row, user.sub) }))
    .sort((a, b) => b.comment.likeCount - a.comment.likeCount || b.comment.createdAt.localeCompare(a.comment.createdAt));
  return {
    comments: ranked.slice(offset, offset + PAGE_SIZE),
    hasMore: ranked.length > offset + PAGE_SIZE,
  };
});
