import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from '#supabase/server';
import type { Database } from '~/types/database.types';

// Record progress in an authenticated reading session. The database decides
// when enough distinct slides were displayed, then awards the point once.
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication is required.' });
  }

  const recapId = event.context.params?.id;
  if (!recapId) {
    throw createError({ statusCode: 400, statusMessage: 'Recap ID is required.' });
  }

  const body = await readBody<{ sessionId?: unknown; slideIndex?: unknown }>(event);
  if (typeof body?.sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.sessionId)
    || (body.slideIndex !== null && (typeof body.slideIndex !== 'number' || !Number.isInteger(body.slideIndex) || body.slideIndex < 0))) {
    throw createError({ statusCode: 400, statusMessage: 'A reading session and slide index are required.' });
  }
  const service = serverSupabaseServiceRole<Database>(event);
  const { data: complete, error } = await service.rpc('record_recap_view_progress', {
    p_session_id: body.sessionId,
    p_recap_id: recapId,
    p_user_id: user.sub,
    p_slide_index: body.slideIndex,
  });
  if (error) {
    if (error.code === 'P0002') throw createError({ statusCode: 409, statusMessage: 'The reading session has expired.' });
    if (error.code === '22023') throw createError({ statusCode: 400, statusMessage: 'The slide is outside this recap.' });
    console.error('Could not record a recap view:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not record this view.' });
  }
  return { complete: Boolean(complete) };
});
