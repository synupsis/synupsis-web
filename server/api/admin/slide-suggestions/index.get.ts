import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database } from '~/types/database.types';
import type { AdminRecapSlideSuggestion } from '~/types/recap-slide-suggestion.types';
import { compareSuggestions, SUGGESTION_COLUMNS, toRecapSlideSuggestion } from '~/server/utils/recap-slide-suggestion';
import { requireAdminUser } from '~/server/utils/require-admin';

// Open suggestions, the most liked first.
export default defineEventHandler(async (event): Promise<AdminRecapSlideSuggestion[]> => {
  const admin = await requireAdminUser(event);
  const service = serverSupabaseServiceRole<Database>(event);
  const { data, error } = await service.from('recap_slide_suggestion').select(`${SUGGESTION_COLUMNS},
    recap:recap_id(id, locale, show:show_id(name), season:season_id(number))
  `).eq('status', 'pending');
  if (error) {
    console.error('Could not load slide suggestion queue:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not load the suggestion queue.' });
  }
  return (data ?? []).map((row: any) => ({
    ...toRecapSlideSuggestion(row, admin.sub),
    recap: {
      id: row.recap?.id ?? '',
      locale: row.recap?.locale ?? null,
      showName: row.recap?.show?.name ?? 'Série inconnue',
      seasonNumber: row.recap?.season?.number ?? null,
    },
  })).sort(compareSuggestions);
});
