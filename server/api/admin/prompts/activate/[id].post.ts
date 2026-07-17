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
    // Deactivate all other prompts
    const { error: deactivateError } = await supabase
      .from('prompts')
      .update({ is_active: false })
      .neq('id', promptId);

    if (deactivateError) {
      console.error('Error deactivating other prompts:', deactivateError);
      throw createError({ statusCode: 500, statusMessage: 'Failed to deactivate other prompts.' });
    }

    // Activate the specified prompt
    const { error: activateError } = await supabase
      .from('prompts')
      .update({ is_active: true })
      .eq('id', promptId);

    if (activateError) {
      console.error('Error activating prompt:', activateError);
      throw createError({ statusCode: 500, statusMessage: 'Failed to activate prompt.' });
    }

    return { status: 'success' };
  } catch (error: any) {
    console.error('Error in activate prompt API:', error);
    throw createError({ statusCode: 500, statusMessage: error.message || 'An internal error occurred' });
  }
});
