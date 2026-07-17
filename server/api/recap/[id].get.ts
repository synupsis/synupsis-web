import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';

export default defineEventHandler(async event => {
  const client = await serverSupabaseClient<Database>(event);
  const recapId = event.context.params?.id;

  if (!recapId) {
    throw createError({ statusCode: 400, statusMessage: 'Recap ID is required' });
  }

  const { data: recap, error } = await client
    .from('recap')
    .select(`
      id,
      status,
      show:show_id ( name ),
      season:season_id ( number, image ),
      slides:slide (
        id,
        order,
        canvas_data
      )
    `)
    .eq('id', recapId)
    .order('order', { foreignTable: 'slide', ascending: true })
    .single();

  if (error) {
    console.error('Error fetching recap:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not fetch recap data' });
  }

  if (!recap) {
    throw createError({ statusCode: 404, statusMessage: 'Recap not found' });
  }

  return recap;
});
