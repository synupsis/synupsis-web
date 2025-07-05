import { serverSupabaseClient } from '#supabase/server';
import { Database } from '~/types/database.types';

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event);
  
  // We should add an admin check here, but for now we'll proceed
  // This will be added in a later step with RLS.

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
