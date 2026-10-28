import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAuthenticatedUser } from '~/server/utils/require-admin';

// Row security limits reports to comments the viewer can read and did not write.
export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event);
  const id = event.context.params?.id ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid comment.' });
  const client = await serverSupabaseClient<Database>(event);
  const { error } = await client.from('episode_comment_report').insert({ comment_id: id, reporter_id: user.sub });
  // Reporting twice changes nothing.
  if (error && error.code !== '23505') {
    if (error.code === '42501') throw createError({ statusCode: 403, statusMessage: 'You cannot report this comment.' });
    console.error('Could not report episode comment:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not report this comment.' });
  }
  return { id };
});
