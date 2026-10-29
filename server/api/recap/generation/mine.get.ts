import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from '#supabase/server';
import type { Database } from '~/types/database.types';
import { RECAP_GENERATION_ACTIVE_STATUSES } from '~/lib/recap-generation-progress';
import { expireStaleRecapGenerationJobs, toPublicJob } from '~/server/services/recap-generation-runner';

// The recaps the viewer is unlocking right now, on any show: the header
// follows them from every page.
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication is required.' });
  }

  const service = serverSupabaseServiceRole<Database>(event);
  await expireStaleRecapGenerationJobs(service);
  const { data, error } = await service
    .from('recap_generation_job')
    .select('*, show:show_id ( name, trakt_id ), season:season_id ( number )')
    .eq('requested_by', user.sub)
    .in('status', RECAP_GENERATION_ACTIVE_STATUSES)
    .order('created_at', { ascending: true });
  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Could not list your running recaps.' });
  }

  return {
    jobs: (data ?? []).map(({ show, season, ...job }) => ({
      ...toPublicJob(job),
      showName: show?.name ?? '',
      // The show page only reads the Trakt ID at the end of its address.
      showPath: show ? `/shows/${slugify(show.name)}-${show.trakt_id}` : null,
      seasonNumber: season?.number ?? 0,
    })),
  };
});

function slugify(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'show';
}
