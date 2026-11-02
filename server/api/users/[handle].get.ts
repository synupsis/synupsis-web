import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { showPath } from '~/lib/show-path';
import { resolvePublicProfile } from '~/server/utils/public-profile';
import type { PublicProfilePayload, PublicProfileRecap } from '~/types/public-profile.types';

// A viewer's public page: who they are, what they unlocked, and what their name is on.
// Only contributions shown with their name count, so nothing made anonymously is tied back to them.
export default defineEventHandler(async (event): Promise<PublicProfilePayload> => {
  const { userId, profile } = await resolvePublicProfile(event);
  const service = serverSupabaseServiceRole<Database>(event);

  const [recaps, views, comments, suggestions] = await Promise.all([
    service.from('recap')
      .select('id, locale, created_at, show:show_id ( name, trakt_id ), season:season_id ( number, image ), recap_view ( count )', { count: 'exact' })
      .eq('unlocked_by', userId)
      .not('unlocked_by_name', 'is', null)
      .eq('status', 'published')
      .eq('is_canonical', true)
      .order('created_at', { ascending: false })
      .limit(100),
    // Count every other viewer's view of a public recap, independently of the displayed page.
    service.from('recap_view')
      .select('recap!inner ( id )', { count: 'exact', head: true })
      .eq('recap.unlocked_by', userId)
      .not('recap.unlocked_by_name', 'is', null)
      .eq('recap.status', 'published')
      .eq('recap.is_canonical', true)
      .neq('user_id', userId),
    service.from('episode_comment')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('author_name', 'is', null),
    service.from('recap_slide_suggestion')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .eq('status', 'accepted')
      .not('author_name', 'is', null),
  ]);
  for (const result of [recaps, views, comments, suggestions]) {
    if (result.error) {
      console.error('Could not load the public profile contributions:', result.error);
      throw createError({ statusCode: 500, statusMessage: 'Could not load this profile.' });
    }
  }

  // Points count the other viewers only: leave out the owner's own view.
  const rows = (recaps.data ?? []).filter(recap => recap.show && recap.season);
  const ownViews = new Set<string>();
  if (rows.length) {
    const { data, error } = await service.from('recap_view')
      .select('recap_id')
      .eq('user_id', userId)
      .in('recap_id', rows.map(recap => recap.id));
    if (error) {
      console.error('Could not load the public profile views:', error);
      throw createError({ statusCode: 500, statusMessage: 'Could not load this profile.' });
    }
    (data ?? []).forEach(view => ownViews.add(view.recap_id));
  }

  const items = rows.map((recap): PublicProfileRecap => ({
    id: recap.id,
    locale: recap.locale,
    showName: recap.show!.name,
    showPath: showPath(recap.show!.name, recap.show!.trakt_id),
    seasonNumber: recap.season!.number,
    image: recap.season!.image,
    views: Math.max(0, (recap.recap_view?.[0]?.count ?? 0) - (ownViews.has(recap.id) ? 1 : 0)),
    unlockedAt: recap.created_at,
  }));

  return {
    profile,
    stats: {
      recaps: recaps.count ?? 0,
      views: views.count ?? 0,
      comments: comments.count ?? 0,
      acceptedSuggestions: suggestions.count ?? 0,
    },
    recaps: items,
  };
});
