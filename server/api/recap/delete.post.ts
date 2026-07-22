import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAdminUser } from '~/server/utils/require-admin';

export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const service = serverSupabaseServiceRole<Database>(event);
  const { recapId } = await readBody<{ recapId?: string }>(event);

  if (!recapId) {
    throw createError({ statusCode: 400, statusMessage: 'Recap ID is required.' });
  }

  const { data, error } = await service
    .from('recap')
    .delete()
    .eq('id', recapId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error deleting recap:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not delete recap.' });
  }
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Recap not found.' });

  return { status: 'Recap deleted successfully' };
});
