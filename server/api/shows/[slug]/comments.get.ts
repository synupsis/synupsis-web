import { EPISODE_COMMENT_COLUMNS, resolveShowForComments, toEpisodeComment } from '~/server/utils/episode-comments';
import type { ShowCommentSort, ShowFeedComment } from '~/types/episode-comment.types';

const PAGE_SIZE = 20;
const SORTS: ShowCommentSort[] = ['newest', 'oldest', 'most-liked', 'episode'];

// Ordering and pagination happen before hydration. Every query, including the
// popularity RPC, uses the viewer's session so row security still hides spoilers.
export default defineEventHandler(async (event) => {
  const { client, user, showId } = await resolveShowForComments(event);
  const params = getQuery(event);
  const sort = params.sort ?? 'most-liked';
  if (typeof sort !== 'string' || !SORTS.includes(sort as ShowCommentSort)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid comment sort.' });
  }
  const offset = Number(params.offset ?? 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 2_147_483_647 - PAGE_SIZE) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid comment offset.' });
  }

  let rankedIds: string[] | null = null;
  let hasMore = false;
  if (sort === 'most-liked') {
    const { data, error } = await client.rpc('most_liked_show_comment_ids', {
      p_show_id: showId, p_offset: offset, p_limit: PAGE_SIZE + 1,
    });
    if (error) fail(error);
    hasMore = (data?.length ?? 0) > PAGE_SIZE;
    rankedIds = (data ?? []).slice(0, PAGE_SIZE).map(row => row.id);
    if (!rankedIds.length) return { comments: [], hasMore: false };
  }

  let query = client.from('episode_comment')
    .select(`${EPISODE_COMMENT_COLUMNS}, season, episode`)
    .eq('show_id', showId)
    .is('parent_id', null);
  if (rankedIds) {
    query = query.in('id', rankedIds);
  } else {
    if (sort === 'episode') {
      query = query.order('season', { ascending: true }).order('episode', { ascending: true });
    }
    query = query.order('created_at', { ascending: sort === 'oldest' })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE);
  }
  const { data, error } = await query;
  if (error) fail(error);
  let rows = data ?? [];
  if (rankedIds) {
    const rank = new Map(rankedIds.map((id, index) => [id, index]));
    rows = rows.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  } else {
    hasMore = rows.length > PAGE_SIZE;
  }
  const comments = rows.slice(0, PAGE_SIZE)
    .map((row: any): ShowFeedComment => ({ season: row.season, episode: row.episode, comment: toEpisodeComment(row, user.sub) }));
  return { comments, hasMore };
});

function fail(error: unknown): never {
  console.error('Could not load the show comments:', error);
  throw createError({ statusCode: 500, statusMessage: 'Could not load the comments.' });
}
