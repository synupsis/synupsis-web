import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { showPath } from '~/lib/show-path';
import { SPOILER_REPORT_THRESHOLD } from '~/server/utils/episode-comments';
import { resolvePublicProfile } from '~/server/utils/public-profile';
import type { PublicProfileActivity, PublicProfileComment, PublicProfileSuggestion } from '~/types/public-profile.types';

const PAGE_SIZE = 20;

// The latest comments and suggestions shown with the viewer's name. Anyone sees
// where they were posted; a comment's text only reaches visitors whose own
// progress reaches the episode, read with their session so row security decides.
export default defineEventHandler(async (event): Promise<{ items: PublicProfileActivity[] }> => {
  const { client, viewer, userId } = await resolvePublicProfile(event);
  const service = serverSupabaseServiceRole<Database>(event);

  const [comments, suggestions] = await Promise.all([
    service.from('episode_comment')
      .select('id, season, episode, parent_id, is_spoiler, spoiler_report_count, created_at, show:show_id ( name, trakt_id ), likes:episode_comment_like ( count )')
      .eq('user_id', userId)
      .not('author_name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE),
    // Declined suggestions stay between their author and the team.
    service.from('recap_slide_suggestion')
      .select('id, kind, status, created_at, recap:recap_id ( id, status, show:show_id ( name, trakt_id ), season:season_id ( number ) ), likes:recap_slide_suggestion_like ( count )')
      .eq('created_by', userId)
      .not('author_name', 'is', null)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE),
  ]);
  if (comments.error || suggestions.error) {
    console.error('Could not load the public profile activity:', comments.error ?? suggestions.error);
    throw createError({ statusCode: 500, statusMessage: 'Could not load this activity.' });
  }

  const commentRows = (comments.data ?? []).filter(row => row.show);
  const bodies = new Map<string, string>();
  if (viewer && commentRows.length) {
    const { data, error } = await client.from('episode_comment')
      .select('id, body')
      .in('id', commentRows.map(row => row.id));
    if (error) {
      console.error('Could not load the readable comments:', error);
      throw createError({ statusCode: 500, statusMessage: 'Could not load this activity.' });
    }
    (data ?? []).forEach(row => bodies.set(row.id, row.body));
  }

  const items: PublicProfileActivity[] = [
    ...commentRows.map((row): PublicProfileComment => ({
      kind: 'comment',
      id: row.id,
      createdAt: row.created_at,
      showName: row.show!.name,
      showPath: showPath(row.show!.name, row.show!.trakt_id),
      season: row.season,
      episode: row.episode,
      isReply: row.parent_id !== null,
      isSpoiler: row.is_spoiler || row.spoiler_report_count >= SPOILER_REPORT_THRESHOLD,
      likeCount: row.likes?.[0]?.count ?? 0,
      body: bodies.get(row.id) ?? null,
    })),
    ...(suggestions.data ?? [])
      .filter(row => row.recap?.status === 'published' && row.recap.show && row.recap.season)
      .map((row): PublicProfileSuggestion => ({
        kind: 'suggestion',
        id: row.id,
        createdAt: row.created_at,
        recapId: row.recap!.id,
        showName: row.recap!.show!.name,
        showPath: showPath(row.recap!.show!.name, row.recap!.show!.trakt_id),
        seasonNumber: row.recap!.season!.number,
        suggestionKind: row.kind as PublicProfileSuggestion['suggestionKind'],
        status: row.status as PublicProfileSuggestion['status'],
        likeCount: row.likes?.[0]?.count ?? 0,
      })),
  ];
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return { items: items.slice(0, PAGE_SIZE) };
});
