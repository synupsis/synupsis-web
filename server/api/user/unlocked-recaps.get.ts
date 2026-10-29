import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from '#supabase/server';
import type { Database } from '~/types/database.types';

// The recaps the viewer unlocked, with how many other people watched each one.
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const service = serverSupabaseServiceRole<Database>(event);
  const { data, error } = await service
    .from('recap')
    .select('id, locale, created_at, show:show_id ( name ), season:season_id ( number ), recap_view ( user_id )')
    .eq('unlocked_by', user.sub)
    .eq('status', 'published')
    .eq('is_canonical', true)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Could not list the unlocked recaps:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not list your unlocked recaps.' });
  }

  return (data ?? []).map(recap => ({
    id: recap.id,
    locale: recap.locale,
    showName: recap.show?.name ?? '',
    seasonNumber: recap.season?.number ?? 0,
    views: (recap.recap_view ?? []).filter(view => view.user_id !== user.sub).length,
  }));
});
