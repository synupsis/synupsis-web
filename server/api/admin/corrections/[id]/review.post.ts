import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAdminUser } from '~/server/utils/require-admin';

export default defineEventHandler(async (event) => {
  const admin = await requireAdminUser(event);
  const correctionId = event.context.params?.id;
  const body = await readBody<{ decision?: 'accepted' | 'rejected' }>(event);
  if (!correctionId || !['accepted', 'rejected'].includes(String(body?.decision))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid review decision.' });
  }
  const service = serverSupabaseServiceRole<Database>(event);
  const { error } = await service.rpc('review_season_content_correction', {
    p_correction_id: correctionId,
    p_decision: body.decision as 'accepted' | 'rejected',
    p_reviewer_id: admin.sub,
  });
  if (error?.code === 'P0002') {
    throw createError({ statusCode: 404, statusMessage: 'Pending correction not found.' });
  }
  if (error) {
    console.error('Could not review correction:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not finish this review.' });
  }
  return { id: correctionId, status: body.decision };
});
