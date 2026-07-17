import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAdminUser } from '~/server/utils/require-admin';

export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const supabase = await serverSupabaseClient<Database>(event);
  const promptId = event.context.params?.id;

  if (!promptId) {
    throw createError({ statusCode: 400, statusMessage: 'Prompt ID is required' });
  }

  try {
    const { data: recaps, error } = await supabase
      .from('recap')
      .select('id, show_id, season_id, created_at, status')
      .eq('prompt_id', promptId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching recaps for prompt:', error);
      throw createError({ statusCode: 500, statusMessage: 'Failed to fetch recaps.' });
    }

    return recaps;
  } catch (error: any) {
    console.error('Error in recaps by prompt API:', error);
    throw createError({ statusCode: 500, statusMessage: error.message || 'An internal error occurred' });
  }
});
