import { serverSupabaseServiceRole } from '#supabase/server';
import { requireAdminUser } from '~/server/utils/require-admin';

export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const serviceRoleSupabase = serverSupabaseServiceRole(event);
  const { userId } = await readBody(event);

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' });
  }

  const { error } = await serviceRoleSupabase.auth.admin.deleteUser(userId);

  if (error) {
    console.error('Error deleting user:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not delete user' });
  }

  return { success: true };
});
