import { getQuery } from 'h3';
import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database } from '~/types/database.types';
import { requireAdminUser } from '~/server/utils/require-admin';

export default defineEventHandler(async (event) => {
  const user = await requireAdminUser(event);
  const query = getQuery(event);
  const showId = typeof query.showId === 'string' ? query.showId : '';
  const seasonId = typeof query.seasonId === 'string' ? query.seasonId : '';
  const recapId = typeof query.recapId === 'string' ? query.recapId : '';

  if (!showId || !seasonId) {
    throw createError({ statusCode: 400, statusMessage: 'showId and seasonId are required.' });
  }

  const service = serverSupabaseServiceRole<Database>(event);
  const [showResult, seasonResult] = await Promise.all([
    service.from('show').select('id, name, image, genres').eq('id', showId).maybeSingle(),
    service.from('season').select('id, number, image, show_id').eq('id', seasonId).maybeSingle(),
  ]);

  if (showResult.error || seasonResult.error) {
    console.error('Failed to load recap editor context:', showResult.error || seasonResult.error);
    throw createError({ statusCode: 500, statusMessage: 'Could not load the show and season.' });
  }
  if (!showResult.data || !seasonResult.data || seasonResult.data.show_id !== showId) {
    throw createError({ statusCode: 404, statusMessage: 'Show or season not found.' });
  }

  const selection = `
    id,
    status,
    user_id,
    is_canonical,
    format_version,
    story_data,
    quality_report,
    source_snapshot,
    slide ( id, order, canvas_data )
  `;

  let recaps: any[] = [];
  if (recapId) {
    const { data, error } = await service
      .from('recap')
      .select(selection)
      .eq('id', recapId)
      .eq('show_id', showId)
      .eq('season_id', seasonId)
      .maybeSingle();
    if (error) throwEditorLoadError(error);
    if (!data) throw createError({ statusCode: 404, statusMessage: 'Recap not found.' });
    recaps = [data];
  } else {
    const { data, error } = await service
      .from('recap')
      .select(selection)
      .eq('show_id', showId)
      .eq('season_id', seasonId)
      .order('created_at', { ascending: false });
    if (error) throwEditorLoadError(error);
    recaps = data || [];
  }

  const recap = recapId
    ? recaps[0]
    : chooseRecap(recaps, user.sub);
  const sourceSnapshot = asObject(recap?.source_snapshot);
  const sourceEpisodes = Array.isArray(sourceSnapshot?.episodes) ? sourceSnapshot.episodes : [];
  const story = asObject(recap?.story_data);
  const beats = Array.isArray(story?.beats) ? story.beats : [];
  const inferredEpisodeCount = beats.reduce((highest: number, beat: unknown) => {
    const value = asObject(beat);
    const numbers = Array.isArray(value?.episodeNumbers) ? value.episodeNumbers.map(Number) : [];
    return Math.max(highest, ...numbers.filter(Number.isFinite), 0);
  }, 0);

  return {
    show: showResult.data,
    season: seasonResult.data,
    episodeCount: sourceEpisodes.length || inferredEpisodeCount,
    recap: recap ? {
      id: recap.id,
      status: recap.status,
      isCanonical: recap.is_canonical,
      formatVersion: recap.format_version,
      storyData: recap.story_data,
      qualityReport: recap.quality_report,
      slides: [...(recap.slide || [])].sort((a: any, b: any) => a.order - b.order),
    } : null,
  };
});

function chooseRecap(recaps: any[], userId: string) {
  const canonical = recaps
    .filter(recap => recap.is_canonical)
    .sort((a, b) => Number(b.format_version) - Number(a.format_version))[0];
  return canonical || recaps.find(recap => recap.user_id === userId) || recaps[0] || null;
}

function asObject(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

function throwEditorLoadError(error: unknown): never {
  console.error('Failed to load recap for the editor:', error);
  throw createError({ statusCode: 500, statusMessage: 'Could not load the recap.' });
}
