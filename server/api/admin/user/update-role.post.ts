import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAdminUser } from '~/server/utils/require-admin';

export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const supabase = await serverSupabaseClient<Database>(event);
  const { userId, newRole } = await readBody(event);

  if (!userId || (newRole !== 'admin' && newRole !== 'user')) {
    throw createError({ statusCode: 400, statusMessage: 'User ID and new role are required' });
  }

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
