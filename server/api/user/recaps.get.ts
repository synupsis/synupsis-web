import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server';
import type { Database } from '~/types/database.types';

export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient<Database>(event);
  const user = await serverSupabaseUser(event);

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const { data: recaps, error } = await client
    .from('recap')
    .select(`
      id,
      status,
      show:show_id ( id, name ),
      season:season_id ( id, number )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user recaps:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not fetch user recaps' });
  }

  return recaps;
});
