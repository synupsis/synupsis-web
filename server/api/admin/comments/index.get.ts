import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database } from '~/types/database.types';
import type { ReportedEpisodeComment } from '~/types/episode-comment.types';
import { requireAdminUser } from '~/server/utils/require-admin';

// Reported comments, the most reported first.
export default defineEventHandler(async (event): Promise<ReportedEpisodeComment[]> => {
  await requireAdminUser(event);
  const service = serverSupabaseServiceRole<Database>(event);
  const { data, error } = await service.from('episode_comment').select(`
    id, author_name, body, created_at, season, episode,
    reports:episode_comment_report!inner(created_at),
    show:show_id(name, trakt_id)
  `).limit(200);
  if (error) {
    console.error('Could not load reported comments:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not load reported comments.' });
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
    reportCount: row.reports.length,
    lastReportedAt: row.reports.map((report: any) => report.created_at).sort().at(-1),
    show: { name: row.show?.name ?? 'Série inconnue', traktId: row.show?.trakt_id ?? null },
    season: row.season,
    episode: row.episode,
  })).sort((a, b) => b.reportCount - a.reportCount || b.lastReportedAt.localeCompare(a.lastReportedAt));
});
