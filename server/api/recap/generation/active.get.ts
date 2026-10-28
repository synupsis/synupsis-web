import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from '#supabase/server';
import type { Database } from '~/types/database.types';
import { RECAP_GENERATION_ACTIVE_STATUSES } from '~/lib/recap-generation-progress';
import { RECAP_FORMAT_VERSION } from '~/server/services/recap-generation/config';
import { expireStaleRecapGenerationJobs, toPublicJob } from '~/server/services/recap-generation-runner';

// Lets a show page pick up the generations still running after a refresh,
// including one started by another user, which anyone signed in may join.
// Every recap language is listed: the page follows each one.
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication is required.' });
  }

  const showId = getQuery(event).showId;
  if (typeof showId !== 'string' || !showId) {
    throw createError({ statusCode: 400, statusMessage: 'showId is required.' });
  }

  const service = serverSupabaseServiceRole<Database>(event);
  await expireStaleRecapGenerationJobs(service);
  const { data, error } = await service
    .from('recap_generation_job')
    .select('*')
    .eq('show_id', showId)
    .eq('format_version', RECAP_FORMAT_VERSION)
    .in('status', RECAP_GENERATION_ACTIVE_STATUSES);
  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Could not list the running generations.' });
  }

  return { jobs: (data ?? []).map(toPublicJob) };
});
