import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from '#supabase/server';
import type { Database } from '~/types/database.types';
import { RECAP_GENERATION_TERMINAL_STATUSES } from '~/lib/recap-generation-progress';

const NOTICE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// The recaps a viewer unlocked that ended while they were away: each one is
// told once, on their next visit.
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication is required.' });
  }

  const service = serverSupabaseServiceRole<Database>(event);
  const { data, error } = await service
    .from('recap_generation_job')
    .update({ requester_notified_at: new Date().toISOString() })
    .eq('requested_by', user.sub)
    .is('requester_notified_at', null)
    .in('status', RECAP_GENERATION_TERMINAL_STATUSES)
    .gt('completed_at', new Date(Date.now() - NOTICE_WINDOW_MS).toISOString())
    .select('id, status, recap_id, key_state, show:show_id ( name ), season:season_id ( number )');
  if (error) {
    console.error('Could not read the recap notices:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not read your recap notices.' });
  }

  return {
    notices: (data ?? []).map(job => ({
      jobId: job.id,
      ready: job.status === 'completed' && Boolean(job.recap_id),
      recapId: job.recap_id,
      keyRefunded: job.key_state === 'refunded',
      showName: job.show?.name ?? '',
      seasonNumber: job.season?.number ?? 0,
    })),
  };
});
