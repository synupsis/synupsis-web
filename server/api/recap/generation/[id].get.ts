import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from '#supabase/server';
import type { Database } from '~/types/database.types';
import { advanceRecapGenerationJob } from '~/server/services/recap-generation-runner';

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication is required.' });
  }

  const jobId = event.context.params?.id;
  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: 'Generation job ID is required.' });
  }

  // The server worker advances jobs too: a poll only speeds the next step up.
  const job = await advanceRecapGenerationJob(serverSupabaseServiceRole<Database>(event), jobId);
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: 'Generation job not found.' });
  }
  return job;
});
