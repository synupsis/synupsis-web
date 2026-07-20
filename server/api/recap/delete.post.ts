import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server';
import type { Database } from '~/types/database.types';

export default defineEventHandler(async event => {
  const client = await serverSupabaseClient<Database>(event);
  const user = await serverSupabaseUser(event);
  const { recapId } = await readBody(event);

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  if (!recapId) {
    throw createError({ statusCode: 400, statusMessage: 'Recap ID is required' });
  }

  // Delete the recap, ensuring the user owns it.
  // RLS policies would also prevent this, but it's good practice to be explicit.
  const { error } = await client
    .from('recap')
    .delete()
    .match({ id: recapId, user_id: user.sub });

  if (error) {
    console.error('Error deleting recap:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not delete recap' });
  }

  return { status: 'Recap deleted successfully' };
});
