import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAdminUser } from '~/server/utils/require-admin';

export default defineEventHandler(async (event) => {
  await requireAdminUser(event);
  const service = serverSupabaseServiceRole<Database>(event);
  const { data, error } = await service.from('season_content_correction').select(`
    id, target_type, target_key, field, current_value, proposed_value,
    reason, source_url, reveal_episode, created_at,
    votes:season_content_correction_vote(value),
    season:season_id(number, show:show_id(name, trakt_id))
  `).eq('status', 'pending').order('created_at', { ascending: true });
  if (error) {
    console.error('Could not load correction queue:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not load correction queue.' });
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    targetType: row.target_type,
    targetKey: row.target_key,
    field: row.field,
    currentValue: row.current_value,
    proposedValue: row.proposed_value,
    reason: row.reason,
    sourceUrl: row.source_url,
    revealEpisode: row.reveal_episode,
    createdAt: row.created_at,
    score: (row.votes ?? []).reduce((sum: number, vote: any) => sum + Math.sign(Number(vote.value)), 0),
    season: {
      number: row.season?.number ?? null,
      showName: row.season?.show?.name ?? 'Série inconnue',
      showTraktId: row.season?.show?.trakt_id ?? null,
    },
  }));
});
