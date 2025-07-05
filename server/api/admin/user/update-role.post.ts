import { serverSupabaseClient } from '#supabase/server';
import { Database } from '~/types/database.types';

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event);
  const { userId, newRole } = await readBody(event);

  if (!userId || !newRole) {
    throw createError({ statusCode: 400, statusMessage: 'User ID and new role are required' });
  }

  // RLS should protect this endpoint
  const { error } = await supabase
    .from('profile')
    .update({ role: newRole })
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating user role:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not update user role' });
  }

  return { success: true };
});
