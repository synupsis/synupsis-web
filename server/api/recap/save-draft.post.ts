import { serverSupabaseClient } from '#supabase/server';
import { Database } from '~/types/database.types';

export default defineEventHandler(async event => {
  const client = await serverSupabaseClient<Database>(event);
  const { slides, showId, seasonId } = await readBody(event);

  if (!slides || !showId || !seasonId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required fields'
    });
  }

  // Here you would typically save the draft to your database
  // For now, we'll just log it to the console

  console.log('Saving draft:', { showId, seasonId, slides });

  return { status: 'Draft saved successfully' };
});
