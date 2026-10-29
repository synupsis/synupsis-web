import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { getRecapStoryPlan } from '~/server/utils/recap-story-plan';

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Authentication is required.' });
  const recapId = event.context.params?.id;
  if (!recapId) throw createError({ statusCode: 400, statusMessage: 'Recap ID is required.' });
  const body = await readBody<{ slideIndex?: unknown }>(event);
  const slideIndex = body?.slideIndex;
  if (typeof slideIndex !== 'number' || !Number.isInteger(slideIndex) || slideIndex < 0) {
    throw createError({ statusCode: 400, statusMessage: 'A valid slide index is required.' });
  }

  const client = await serverSupabaseClient<Database>(event);
  const { data: recap, error: recapError } = await client.from('recap')
    .select('status, story_data, source_snapshot, event_graph, slides:slide(id)')
    .eq('id', recapId).eq('status', 'published').maybeSingle();
  if (recapError) throw createError({ statusCode: 500, statusMessage: 'Could not load this recap.' });
  if (!recap) throw createError({ statusCode: 404, statusMessage: 'Published recap not found.' });
  const slideCount = getRecapStoryPlan(recap)?.length ?? recap.slides.length;
  if (slideIndex >= slideCount) {
    throw createError({ statusCode: 400, statusMessage: 'The slide is outside this recap.' });
  }
  const service = serverSupabaseServiceRole<Database>(event);
  const { data: sessionId, error } = await service.rpc('start_recap_view_session', {
    p_recap_id: recapId, p_user_id: user.sub, p_slide_count: slideCount, p_slide_index: slideIndex,
  });
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not start this recap view.' });
  return { sessionId, complete: sessionId === null };
});
