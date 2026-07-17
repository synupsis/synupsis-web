import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAdminUser } from '~/server/utils/require-admin';

export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const supabase = await serverSupabaseClient<Database>(event);
  const { data: profiles, error: profilesError } = await supabase
    .from('profile')
    .select('id, user_id, role');

  if (profilesError) {
    console.error('Error fetching profiles for admin:', profilesError);
    throw createError({ statusCode: 500, statusMessage: 'Could not fetch users' });
  }

  const emailByUserId = new Map<string, string>();

  try {
    const serviceRoleSupabase = serverSupabaseServiceRole(event);
    const { data: usersData, error: usersError } = await serviceRoleSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (usersError) {
      throw usersError;
    }

    for (const user of usersData.users) {
      emailByUserId.set(user.id, user.email ?? '');
    }
  } catch (error) {
    console.warn('Admin users email lookup unavailable, falling back to profile data only:', error);
  }

  return (profiles ?? []).map((profile) => ({
    id: profile.id,
    user_id: profile.user_id,
    role: profile.role,
    email: emailByUserId.get(profile.user_id) ?? '',
  }));
});
