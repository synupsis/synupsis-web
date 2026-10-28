import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAuthenticatedUser } from '~/server/utils/require-admin';

// Authors flag or unflag their comment as a spoiler; row security and the
// column grant keep the rest of the comment unchanged.
export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event);
  const id = event.context.params?.id ?? '';
  const body = await readBody<{ isSpoiler?: unknown }>(event);
  if (!/^[0-9a-f-]{36}$/i.test(id) || typeof body?.isSpoiler !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid spoiler flag.' });
  }
  const client = await serverSupabaseClient<Database>(event);
  const { data, error } = await client.from('episode_comment')
    .update({ is_spoiler: body.isSpoiler })
    .eq('id', id)
    .eq('user_id', user.sub)
    .select('id');
  if (error) {
    console.error('Could not update episode comment:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not update this comment.' });
  }
  if (!data?.length) throw createError({ statusCode: 404, statusMessage: 'Comment not found.' });
  return { id, isSpoiler: body.isSpoiler };
});
