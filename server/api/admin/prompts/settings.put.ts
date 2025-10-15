import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';

export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient<Database>(event);
  const body = await readBody<{ enabled?: boolean }>(event);

  if (typeof body?.enabled !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload. Expected "enabled" boolean.' });
  }

  const { error } = await client
    .from('app_settings')
    .upsert(
      {
        key: 'use_default_prompt',
        value: { enabled: body.enabled },
      },
      { onConflict: 'key' },
    );

  if (error) {
    console.error('Error updating prompt settings:', error);
    throw createError({ statusCode: 500, statusMessage: 'Error updating prompt settings' });
  }

  return { enabled: body.enabled };
});
