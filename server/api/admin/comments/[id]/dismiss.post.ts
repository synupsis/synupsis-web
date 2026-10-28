import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAdminUser } from '~/server/utils/require-admin';

// Keeps the comment and clears its reports.
export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const id = event.context.params?.id ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid comment.' });
  const service = serverSupabaseServiceRole<Database>(event);
  const { error } = await service.from('episode_comment_report').delete().eq('comment_id', id);
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not dismiss these reports.' });
  return { id };
});
