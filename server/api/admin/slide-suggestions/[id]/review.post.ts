import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAdminUser } from '~/server/utils/require-admin';

export default defineEventHandler(async (event) => {
  const admin = await requireAdminUser(event);
  const suggestionId = event.context.params?.id;
  const body = await readBody<{ decision?: 'accepted' | 'rejected' }>(event);
  if (!suggestionId || !['accepted', 'rejected'].includes(String(body?.decision))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid review decision.' });
  }
  const service = serverSupabaseServiceRole<Database>(event);
  const { data, error } = await service.from('recap_slide_suggestion')
    .update({ status: body.decision, reviewed_by: admin.sub, reviewed_at: new Date().toISOString() })
    .eq('id', suggestionId)
    .eq('status', 'pending')
    .select('id');
  if (error) {
    console.error('Could not review slide suggestion:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not finish this review.' });
  }
  if (!data?.length) throw createError({ statusCode: 404, statusMessage: 'Pending suggestion not found.' });
  return { id: suggestionId, status: body.decision };
});
