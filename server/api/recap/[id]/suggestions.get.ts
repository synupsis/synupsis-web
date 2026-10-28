import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database } from '~/types/database.types';
import {
  compareSuggestions, optionalViewerId, requireReadableRecap, SUGGESTION_COLUMNS, toRecapSlideSuggestion,
} from '~/server/utils/recap-slide-suggestion';

// Everyone's open and accepted suggestions on this recap, the most liked first;
// declined ones only for their author.
export default defineEventHandler(async (event) => {
  const recapId = event.context.params?.id ?? '';
  await requireReadableRecap(event, recapId);
  const viewerId = await optionalViewerId(event);

  const service = serverSupabaseServiceRole<Database>(event);
  const { data, error } = await service.from('recap_slide_suggestion')
    .select(SUGGESTION_COLUMNS)
    .eq('recap_id', recapId);
  if (error) {
    console.error('Could not load slide suggestions:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not load the suggestions.' });
  }
  return (data ?? [])
    .filter(row => row.status !== 'rejected' || (viewerId && row.created_by === viewerId))
    .map(row => toRecapSlideSuggestion(row, viewerId))
    .sort(compareSuggestions);
});
