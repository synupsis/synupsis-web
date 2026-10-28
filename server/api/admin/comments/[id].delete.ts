import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAdminUser } from '~/server/utils/require-admin';

// Removes any comment, with its reports.
export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const id = event.context.params?.id ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid comment.' });
  const service = serverSupabaseServiceRole<Database>(event);
  const { data, error } = await service.from('episode_comment').delete().eq('id', id).select('id');
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not delete this comment.' });
  if (!data?.length) throw createError({ statusCode: 404, statusMessage: 'Comment not found.' });
  return { id };
});
