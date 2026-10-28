import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireReadableRecap } from '~/server/utils/recap-slide-suggestion';
import { requireAuthenticatedUser } from '~/server/utils/require-admin';

// Likes or unlikes a suggestion of a recap the viewer can read; not one's own.
export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event);
  const id = event.context.params?.id ?? '';
  const body = await readBody<{ active?: unknown }>(event);
  if (!/^[0-9a-f-]{36}$/i.test(id) || typeof body?.active !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid like.' });
  }
  const service = serverSupabaseServiceRole<Database>(event);
  const { data: suggestion } = await service.from('recap_slide_suggestion')
    .select('recap_id, created_by, status').eq('id', id).maybeSingle();
  if (!suggestion || suggestion.status === 'rejected') {
    throw createError({ statusCode: 404, statusMessage: 'Suggestion not found.' });
  }
  await requireReadableRecap(event, suggestion.recap_id);
  if (suggestion.created_by === user.sub) {
    throw createError({ statusCode: 403, statusMessage: 'You cannot like your own suggestion.' });
  }
  const { error } = body.active
    ? await service.from('recap_slide_suggestion_like').upsert({ suggestion_id: id, user_id: user.sub }, { ignoreDuplicates: true })
    : await service.from('recap_slide_suggestion_like').delete().eq('suggestion_id', id).eq('user_id', user.sub);
  if (error) {
    console.error('Could not save suggestion like:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not save your like.' });
  }
  return { id, active: body.active };
});
