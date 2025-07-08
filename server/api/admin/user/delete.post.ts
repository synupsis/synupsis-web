import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server';
import { Database } from '~/types/database.types';

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event);
  const serviceRoleSupabase = serverSupabaseServiceRole(event);
  const { userId } = await readBody(event);

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' });
  }

  // RLS should protect this endpoint for regular admins
  // We use the service role key to bypass RLS for user deletion
  const { error } = await serviceRoleSupabase.auth.admin.deleteUser(userId);

  if (error) {
    console.error('Error deleting user:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not delete user' });
  }

  return { success: true };
});
