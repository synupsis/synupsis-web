import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAuthenticatedUser } from '~/server/utils/require-admin';

export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event);
  const correctionId = event.context.params?.id;
  const body = await readBody<{ value?: number; throughEpisode?: number }>(event);
  if (!correctionId || ![-1, 1].includes(Number(body?.value)) || !Number.isInteger(body?.throughEpisode)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid vote.' });
  }
  const service = serverSupabaseServiceRole<Database>(event);
  const { data: correction } = await service.from('season_content_correction')
    .select('id, reveal_episode, status').eq('id', correctionId).maybeSingle();
  if (!correction || correction.status !== 'pending') {
    throw createError({ statusCode: 404, statusMessage: 'Correction not found.' });
  }
  if (correction.reveal_episode > Number(body.throughEpisode)) {
    throw createError({ statusCode: 403, statusMessage: 'This correction is outside your spoiler level.' });
  }
  const { error } = await service.from('season_content_correction_vote').upsert({
    correction_id: correctionId,
    user_id: user.sub,
    value: Number(body.value),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'correction_id,user_id' });
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not save this vote.' });
  return { value: Number(body.value) };
});
