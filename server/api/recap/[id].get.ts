import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';

export default defineEventHandler(async event => {
  const client = await serverSupabaseClient<Database>(event);
  const recapId = event.context.params?.id;

  if (!recapId) {
    throw createError({ statusCode: 400, statusMessage: 'Recap ID is required' });
  }

  const { data: recap, error } = await client
    .from('recap')
    .select(`
      id,
      status,
      source_snapshot,
      story_data,
      quality_report,
      show:show_id ( name, trakt_id ),
      season:season_id ( number, image ),
      slides:slide (
        id,
        order,
        canvas_data
      )
    `)
    .eq('id', recapId)
    .order('order', { foreignTable: 'slide', ascending: true })
    .single();

  if (error) {
    console.error('Error fetching recap:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not fetch recap data' });
  }

  if (!recap) {
    throw createError({ statusCode: 404, statusMessage: 'Recap not found' });
  }

  const sourceSnapshot = asObject(recap.source_snapshot);
  const story = asObject(recap.story_data);
  const providers = Array.isArray(sourceSnapshot?.providers) ? sourceSnapshot.providers : [];
  const episodes = Array.isArray(sourceSnapshot?.episodes) ? sourceSnapshot.episodes : [];
  const beats = Array.isArray(story?.beats) ? story.beats : [];
  const providerById = new Map(providers.map((provider) => {
    const value = asObject(provider);
    return [String(value?.id || ''), value] as const;
  }));
  const evidenceById = new Map<string, Record<string, any>>();

  episodes.forEach((episode) => {
    const value = asObject(episode);
    const evidence = Array.isArray(value?.evidence) ? value.evidence : [];
    evidence.forEach((item) => {
      const fragment = asObject(item);
      if (fragment?.id) evidenceById.set(String(fragment.id), fragment);
    });
  });

  const slides = recap.slides.map((slide) => {
    const beat = slide.order > 1 ? asObject(beats[slide.order - 2]) : null;
    const evidenceIds = Array.isArray(beat?.evidenceIds) ? beat.evidenceIds.map(String) : [];
    return {
      ...slide,
      evidence: evidenceIds.map((id) => {
        const fragment = evidenceById.get(id);
        const provider = fragment ? providerById.get(String(fragment.providerId || '')) : null;
        return fragment ? {
          id,
          episodeNumber: Number(fragment.episodeNumber) || null,
          locale: String(fragment.locale || 'und'),
          provider: String(provider?.label || fragment.providerId || 'Source'),
          sourceUrl: typeof fragment.sourceUrl === 'string' ? fragment.sourceUrl : null,
        } : null;
      }).filter(Boolean),
    };
  });

  return {
    id: recap.id,
    status: recap.status,
    show: recap.show,
    season: recap.season,
    slides,
    sourceProviders: providers.map((provider) => {
      const value = asObject(provider);
      return {
        id: String(value?.id || ''),
        label: String(value?.label || value?.id || 'Source'),
        sourceUrl: typeof value?.sourceUrl === 'string' ? value.sourceUrl : null,
        termsUrl: typeof value?.termsUrl === 'string' ? value.termsUrl : null,
      };
    }),
    qualityReport: recap.quality_report,
  };
});

function asObject(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}
