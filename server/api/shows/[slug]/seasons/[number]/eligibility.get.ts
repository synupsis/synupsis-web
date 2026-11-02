import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { fetchSeasonRecapAvailability } from '~/server/services/recap-eligibility';

// A display hint only: generation always checks fresh upstream data again.
// Do not use the episodes endpoint, which removes unaired episodes.
export default defineEventHandler(async (event) => {
  const slug = event.context.params?.slug;
  const traktId = Number(slug?.split('-').pop());
  const seasonNumber = Number(event.context.params?.number);
  if (!slug || !Number.isSafeInteger(traktId) || traktId <= 0
    || !Number.isSafeInteger(seasonNumber) || seasonNumber < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid show or season.' });
  }

  const service = serverSupabaseServiceRole<Database>(event);
  const { data: show, error } = await service.from('show').select('id').eq('trakt_id', traktId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not load this show.' });
  if (!show) throw createError({ statusCode: 404, statusMessage: 'Show not found.' });
  const { data: season, error: seasonError } = await service.from('season').select('id')
    .eq('show_id', show.id).eq('number', seasonNumber).maybeSingle();
  if (seasonError) throw createError({ statusCode: 500, statusMessage: 'Could not load this season.' });
  if (!season) throw createError({ statusCode: 404, statusMessage: 'Season not found.' });

  setResponseHeader(event, 'Cache-Control', 'no-store');
  const { eligibility } = await fetchSeasonRecapAvailability(traktId, seasonNumber);
  return { eligibility };
});
