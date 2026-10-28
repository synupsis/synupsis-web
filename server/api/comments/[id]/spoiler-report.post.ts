import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { SPOILER_REPORT_THRESHOLD } from '~/server/utils/episode-comments';
import { requireAuthenticatedUser } from '~/server/utils/require-admin';

// Row security limits spoiler reports to comments the viewer can read and did not write.
export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event);
  const id = event.context.params?.id ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid comment.' });
  const client = await serverSupabaseClient<Database>(event);
  const { error } = await client.from('episode_comment_spoiler_report').insert({ comment_id: id, reporter_id: user.sub });
  // Reporting twice changes nothing.
  if (error && error.code !== '23505') {
    if (error.code === '42501') throw createError({ statusCode: 403, statusMessage: 'You cannot report this comment.' });
    console.error('Could not report a spoiler:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not report this spoiler.' });
  }
  const { data } = await client.from('episode_comment').select('spoiler_report_count').eq('id', id).maybeSingle();
  return { id, reportedAsSpoiler: (data?.spoiler_report_count ?? 0) >= SPOILER_REPORT_THRESHOLD };
});
