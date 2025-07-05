import { serverSupabaseClient } from '#supabase/server';
import { Database } from '~/types/database.types';

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event);

  // This should be protected by RLS to only allow admins
  const { data: users, error } = await supabase
    .from('user_profiles') // Using the view we created earlier
    .select('id, user_id, role, email');

  if (error) {
    console.error('Error fetching users for admin:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not fetch users' });
  }

  return users;
});
