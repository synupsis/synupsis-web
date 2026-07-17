import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAdminUser } from '~/server/utils/require-admin';

export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const client = await serverSupabaseClient<Database>(event);

  const { data, error } = await client
    .from('app_settings')
    .select('value')
    .eq('key', 'use_default_prompt')
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching prompt settings:', error);
    throw createError({ statusCode: 500, statusMessage: 'Error fetching prompt settings' });
  }

  const enabled = data?.value?.enabled === true;
  return { enabled };
});
