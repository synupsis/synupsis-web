import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAdminUser } from '~/server/utils/require-admin';

export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const supabase = await serverSupabaseClient<Database>(event);

  const [
    { count: showCount },
    { count: seasonCount },
    { data: recapStatusData }
  ] = await Promise.all([
    supabase.from('show').select('*', { count: 'exact', head: true }),
    supabase.from('season').select('*', { count: 'exact', head: true }),
    supabase.from('recap').select('status')
  ]);

  const recapStats = {
    total: recapStatusData?.length ?? 0,
    published: recapStatusData?.filter(r => r.status === 'published').length ?? 0,
    drafts: recapStatusData?.filter(r => r.status === 'draft').length ?? 0,
  };

  return {
    shows: showCount ?? 0,
    seasons: seasonCount ?? 0,
    recaps: recapStats,
  };
});
