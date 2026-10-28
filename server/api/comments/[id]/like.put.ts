import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAuthenticatedUser } from '~/server/utils/require-admin';

// Likes or unlikes a comment; row security limits it to readable comments.
export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event);
  const id = event.context.params?.id ?? '';
  const body = await readBody<{ active?: unknown }>(event);
  if (!/^[0-9a-f-]{36}$/i.test(id) || typeof body?.active !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid like.' });
  }
  const client = await serverSupabaseClient<Database>(event);
  const { error } = body.active
    ? await client.from('episode_comment_like').insert({ comment_id: id, user_id: user.sub })
    : await client.from('episode_comment_like').delete().eq('comment_id', id).eq('user_id', user.sub);
  // Liking twice changes nothing.
  if (error && error.code !== '23505') {
    if (error.code === '42501') throw createError({ statusCode: 403, statusMessage: 'You cannot like this comment.' });
    console.error('Could not save comment like:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not save your like.' });
  }
  return { id, active: body.active };
});
