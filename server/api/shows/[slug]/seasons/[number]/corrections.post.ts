import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database, Json } from '~/types/database.types';
import type { SeasonHubCorrectionInput } from '~/types/season-hub.types';
import { buildSeasonHub, findCorrectionTarget, isEditableCorrectionField } from '~/server/services/season-hub';
import { requireAuthenticatedUser } from '~/server/utils/require-admin';

export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event);
  const body = await readBody<SeasonHubCorrectionInput>(event);
  const traktId = Number(event.context.params?.slug?.split('-').pop());
  const seasonNumber = Number(event.context.params?.number);
  if (!Number.isInteger(traktId) || !Number.isInteger(seasonNumber)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid show or season.' });
  }
  if (!body || !isEditableCorrectionField(body.targetType, body.field)) {
    throw createError({ statusCode: 400, statusMessage: 'This field cannot be corrected.' });
  }
  if (!Number.isInteger(body.throughEpisode) || !Number.isInteger(body.revealEpisode)
    || body.revealEpisode < 0 || body.revealEpisode > body.throughEpisode) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid spoiler level.' });
  }
  if (typeof body.proposedValue !== 'string' || body.proposedValue.trim().length < 2
    || body.proposedValue.length > 3000 || typeof body.reason !== 'string'
    || body.reason.trim().length < 10 || body.reason.length > 2000) {
    throw createError({ statusCode: 400, statusMessage: 'The proposal or explanation is invalid.' });
  }
  const sourceUrl = normalizeUrl(body.sourceUrl);
  if (body.sourceUrl && !sourceUrl) {
    throw createError({ statusCode: 400, statusMessage: 'The source URL is invalid.' });
  }

  const service = serverSupabaseServiceRole<Database>(event);
  const { data: show } = await service.from('show').select('id, name, image, summary, genres')
    .eq('trakt_id', traktId).maybeSingle();
  if (!show) throw createError({ statusCode: 404, statusMessage: 'Show not found.' });
  const { data: season } = await service.from('season').select('id, number, name, image, first_aired')
    .eq('show_id', show.id).eq('number', seasonNumber).maybeSingle();
  if (!season) throw createError({ statusCode: 404, statusMessage: 'Season not found.' });
  const { data: recap } = await service.from('recap').select('id, source_snapshot, event_graph')
    .eq('season_id', season.id).eq('status', 'published').not('source_snapshot', 'is', null)
    .not('event_graph', 'is', null).order('format_version', { ascending: false }).limit(1).maybeSingle();

  const hub = buildSeasonHub({
    show: { ...show, slug: event.context.params?.slug ?? '', genres: show.genres ?? [] },
    season: {
      id: season.id, number: season.number, name: season.name || `Saison ${season.number}`,
      image: season.image, firstAired: season.first_aired,
    },
    recapId: recap?.id ?? null,
    sourceSnapshot: recap?.source_snapshot ?? null,
    eventGraph: recap?.event_graph ?? null,
    requestedThroughEpisode: body.throughEpisode,
  });
  const currentValue = findCorrectionTarget(hub, body.targetType, body.targetKey, body.field);
  if (currentValue === undefined || JSON.stringify(currentValue) !== JSON.stringify(body.currentValue)) {
    throw createError({ statusCode: 409, statusMessage: 'This information changed or is outside your spoiler level.' });
  }
  if (body.proposedValue.trim() === String(currentValue).trim()) {
    throw createError({ statusCode: 400, statusMessage: 'The proposal is identical to the current value.' });
  }

  const { data: correction, error } = await service.from('season_content_correction').insert({
    season_id: season.id,
    target_type: body.targetType,
    target_key: body.targetKey,
    field: body.field,
    current_value: currentValue as Json,
    proposed_value: body.proposedValue.trim(),
    reason: body.reason.trim(),
    source_url: sourceUrl,
    reveal_episode: body.revealEpisode,
    created_by: user.sub,
  }).select('id').single();
  if (error || !correction) {
    console.error('Could not create season correction:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not submit this correction.' });
  }
  setResponseStatus(event, 201);
  return { id: correction.id, status: 'pending' };
});

function normalizeUrl(value: unknown): string | null {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
