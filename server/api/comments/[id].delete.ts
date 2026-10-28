import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAuthenticatedUser } from '~/server/utils/require-admin';

// Row security limits the deletion to the author's own comments.
export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event);
  const id = event.context.params?.id ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid comment.' });
  const client = await serverSupabaseClient<Database>(event);
  const { data, error } = await client.from('episode_comment').delete().eq('id', id).eq('user_id', user.sub).select('id');
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not delete this comment.' });
  if (!data?.length) throw createError({ statusCode: 404, statusMessage: 'Comment not found.' });
  return { id };
});
