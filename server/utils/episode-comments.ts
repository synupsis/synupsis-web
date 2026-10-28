import type { H3Event } from 'h3';
import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import type { EpisodeComment } from '~/types/episode-comment.types';
import { requireAuthenticatedUser } from '~/server/utils/require-admin';

const COMMENT_FIELDS = `id, user_id, parent_id, author_name, author_avatar_url, body, is_spoiler, spoiler_report_count, created_at,
  likes:episode_comment_like(user_id),
  reports:episode_comment_report(reporter_id),
  spoiler_reports:episode_comment_spoiler_report(reporter_id)`;
// From this many viewer reports, a comment is hidden as a spoiler for everyone.
export const SPOILER_REPORT_THRESHOLD = 2;
// Row security keeps only the viewer's own reports.
export const EPISODE_COMMENT_COLUMNS = `${COMMENT_FIELDS},
  replies:episode_comment!parent_id(${COMMENT_FIELDS})`;
export const EPISODE_COMMENT_MAX_LENGTH = 2000;

type EpisodeCommentRow = Pick<Database['public']['Tables']['episode_comment']['Row'], 'id' | 'user_id' | 'parent_id' | 'author_name' | 'author_avatar_url' | 'body' | 'is_spoiler' | 'created_at'> & {
  spoiler_report_count?: number;
  likes?: Array<{ user_id: string }>;
  reports?: Array<{ reporter_id: string }>;
  spoiler_reports?: Array<{ reporter_id: string }>;
  replies?: EpisodeCommentRow[];
};

// Comments are only reachable by viewers whose progress reaches the episode, so they spoil nothing.
export async function resolveWatchedEpisode(event: H3Event) {
  const user = await requireAuthenticatedUser(event);
  const traktId = Number(event.context.params?.slug?.split('-').pop());
  const season = Number(event.context.params?.number);
  const episode = Number(event.context.params?.episode);
  if (!Number.isInteger(traktId) || traktId <= 0 || !Number.isInteger(season) || season <= 0
    || !Number.isInteger(episode) || episode <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid episode.' });
  }
  const client = await serverSupabaseClient<Database>(event);
  const { data: show, error } = await client.from('show').select('id').eq('trakt_id', traktId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not load this show.' });
  if (!show) throw createError({ statusCode: 404, statusMessage: 'Show not found.' });
  const { data: watched, error: watchedError } = await client.rpc('has_watched_episode', {
    p_show_id: show.id, p_season: season, p_episode: episode,
  });
  if (watchedError) throw createError({ statusCode: 500, statusMessage: 'Could not check your progress.' });
  if (!watched) throw createError({ statusCode: 403, statusMessage: 'Mark this episode as watched to read its comments.' });
  return { client, user, showId: show.id, season, episode };
}

export function toEpisodeComment(row: EpisodeCommentRow, viewerId: string): EpisodeComment {
  const likes = row.likes ?? [];
  const reportedAsSpoiler = (row.spoiler_report_count ?? 0) >= SPOILER_REPORT_THRESHOLD;
  return {
    id: row.id,
    parentId: row.parent_id,
    isSpoiler: row.is_spoiler || reportedAsSpoiler,
    markedSpoilerByAuthor: row.is_spoiler,
    reportedAsSpoiler,
    isSpoilerReported: (row.spoiler_reports ?? []).some(report => report.reporter_id === viewerId),
    authorName: row.author_name,
    authorAvatarUrl: row.author_avatar_url,
    body: row.body,
    createdAt: row.created_at,
    isOwn: row.user_id === viewerId,
    isReported: (row.reports ?? []).some(report => report.reporter_id === viewerId),
    likeCount: likes.length,
    isLiked: likes.some(like => like.user_id === viewerId),
    replies: [...(row.replies ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(reply => toEpisodeComment({ ...reply, replies: [] }, viewerId)),
  };
}
