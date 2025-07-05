import { serverSupabaseClient } from '#supabase/server';
import { Database } from '~/types/database.types';

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const { data, error, count } = await supabase
    .from('recap')
    .select('status', { count: 'exact' })
    .eq('user_id', user.id);

  if (error) {
    console.error('Error fetching user stats:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not fetch user statistics' });
  }

  const stats = {
    total: count ?? 0,
    published: data.filter(r => r.status === 'published').length,
    drafts: data.filter(r => r.status === 'draft').length,
  };

  return stats;
});
