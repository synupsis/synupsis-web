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
      event_graph,
      story_data,
      quality_report,
      show:show_id ( name, trakt_id, genres ),
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
  const eventGraph = asObject(recap.event_graph);
  const story = asObject(recap.story_data);
  const providers = Array.isArray(sourceSnapshot?.providers) ? sourceSnapshot.providers : [];
  const episodes = Array.isArray(sourceSnapshot?.episodes) ? sourceSnapshot.episodes : [];
  const beats = Array.isArray(story?.beats) ? story.beats : [];
  const events = Array.isArray(eventGraph?.events) ? eventGraph.events : [];
  const providerById = new Map(providers.map((provider) => {
    const value = asObject(provider);
    return [String(value?.id || ''), value] as const;
  }));
  const evidenceById = new Map<string, Record<string, any>>();
  const eventById = new Map(events.map((event) => {
    const value = asObject(event);
    return [String(value?.id || ''), value] as const;
  }));

  const season = asObject(sourceSnapshot?.season);
  const seasonEvidence = Array.isArray(season?.evidence) ? season.evidence : [];
  seasonEvidence.forEach((item) => {
    const fragment = asObject(item);
    if (fragment?.id) evidenceById.set(String(fragment.id), fragment);
  });

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
    const eventIds = Array.isArray(beat?.eventIds) ? beat.eventIds.map(String) : [];
    return {
      ...slide,
      image_url: extractCanvasImageUrl(slide.canvas_data),
      content: slide.order === 1
        ? createCoverContent(story, episodes.length)
        : createBeatContent(beat),
      events: eventIds.map((id) => {
        const storyEvent = eventById.get(id);
        return storyEvent ? {
          id,
          title: String(storyEvent.title || ''),
          confidence: Number(storyEvent.confidence) || 0,
        } : null;
      }).filter(Boolean),
      evidence: evidenceIds.map((id) => {
        const fragment = evidenceById.get(id);
        const provider = fragment ? providerById.get(String(fragment.providerId || '')) : null;
        return fragment ? {
          id,
          episodeNumber: Number(fragment.episodeNumber) || null,
          locale: String(fragment.locale || 'und'),
          provider: String(provider?.label || fragment.providerId || 'Source'),
          sourceUrl: typeof fragment.sourceUrl === 'string' ? fragment.sourceUrl : null,
          revisionId: typeof fragment.revisionId === 'string' ? fragment.revisionId : null,
          licenseName: String(provider?.licenseName || fragment.licenseId || 'Licence non précisée'),
          licenseUrl: typeof provider?.licenseUrl === 'string' ? provider.licenseUrl : null,
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
        licenseName: String(value?.licenseName || 'Licence non précisée'),
        licenseUrl: typeof value?.licenseUrl === 'string' ? value.licenseUrl : null,
        commercialUse: String(value?.commercialUse || 'unknown'),
        attributionRequired: Boolean(value?.attributionRequired),
      };
    }),
    sourceRights: asObject(sourceSnapshot?.rights),
    qualityReport: recap.quality_report,
  };
});

function asObject(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

function createCoverContent(story: Record<string, any> | null, episodeCount: number) {
  const cover = asObject(story?.cover);
  if (!cover?.title) return null;
  return {
    kind: 'cover' as const,
    title: String(cover.title),
    subtitle: String(cover.subtitle || ''),
    logline: String(cover.logline || ''),
    episodeCount,
  };
}

function createBeatContent(beat: Record<string, any> | null) {
  if (!beat?.headline || !beat?.narration) return null;
  return {
    kind: 'beat' as const,
    headline: String(beat.headline),
    narration: String(beat.narration),
    tag: String(beat.tag || ''),
    episodeNumbers: Array.isArray(beat.episodeNumbers)
      ? beat.episodeNumbers.map(Number).filter(Number.isInteger)
      : [],
  };
}

function extractCanvasImageUrl(canvas: unknown): string | null {
  const stage = asObject(canvas);
  const layers = Array.isArray(stage?.children) ? stage.children : [];
  for (const layerItem of layers) {
    const layer = asObject(layerItem);
    const children = Array.isArray(layer?.children) ? layer.children : [];
    for (const childItem of children) {
      const child = asObject(childItem);
      const attrs = asObject(child?.attrs);
      if (child?.className === 'Image' && typeof attrs?.src === 'string') return attrs.src;
    }
  }
  return null;
}
