import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from '#supabase/server';
import type { Database } from '~/types/database.types';
import { RECAP_GENERATION_TERMINAL_STATUSES } from '~/lib/recap-generation-progress';
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

  const service = serverSupabaseServiceRole<Database>(event);
  // The server worker advances jobs too: a poll only speeds the next step up.
  const job = await advanceRecapGenerationJob(service, jobId);
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: 'Generation job not found.' });
  }
  // The requester watched it end: nothing to tell them on their next visit.
  if (RECAP_GENERATION_TERMINAL_STATUSES.includes(job.status)) {
    await service
      .from('recap_generation_job')
      .update({ requester_notified_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('requested_by', user.sub)
      .is('requester_notified_at', null);
  }
  // Joining or resuming a job does not establish who paid for it. The database
  // confirms the refund belongs to this viewer, including on repeat polls.
  let keyRefunded = false;
  if (job.keyState === 'refunded') {
    const { data, error } = await service
      .from('recap_generation_job')
      .select('id')
      .eq('id', job.id)
      .eq('requested_by', user.sub)
      .eq('key_state', 'refunded')
      .maybeSingle();
    if (error) console.warn('Could not confirm the recap key refund:', error);
    keyRefunded = !error && Boolean(data);
  }
  return { ...job, keyRefunded };
});
