import { serverSupabaseClient } from '#supabase/server';
import { toDisplayImageUrl } from '~/server/services/recap-generation/slides';
import { getRecapStoryPlan } from '~/server/utils/recap-story-plan';
import { getRecapCoverArt } from '~/server/services/recap-cover-art';
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
      unlocked_by_name,
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
  const storyEpisodes = Array.isArray(story?.episodes) ? story.episodes : [];
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

  // Format version 10: the slides follow the chapters plan the generation used.
  const plannedSlides = getRecapStoryPlan(recap);

  // The plan decides the slides; a stored slide only lends its canvas and image,
  // so a recap stored before a change of the plan still shows every slide.
  const coverImage = recap.slides[0] ? extractCanvasImageUrl(recap.slides[0].canvas_data) : null;
  const chapterSlides = plannedSlides?.map((planned, index) => {
    const stored = recap.slides.find(slide => slide.order === index + 1);
    const evidenceIds = [...new Set(planned.eventIds.flatMap((id) => {
      const evidence = eventById.get(id)?.evidenceIds;
      return Array.isArray(evidence) ? evidence.map(String) : [];
    }))];
    return {
      id: stored?.id ?? `${recap.id}-planned-${index + 1}`,
      order: index + 1,
      canvas_data: stored?.canvas_data ?? null,
      image_url: planned.imageUrl
        ? toDisplayImageUrl(planned.imageUrl)
        : (stored ? extractCanvasImageUrl(stored.canvas_data) : null) ?? coverImage,
      image_focus: planned.imageFocus,
      content: planned.content,
      events: describeEvents(planned.eventIds, eventById),
      evidence: describeEvidence(evidenceIds, evidenceById, providerById),
    };
  });

  const slides = chapterSlides ?? recap.slides.map((slide) => {
    // Format versions 4 to 9: cover, then the turning points, then one slide per episode.
    const beatIndex = slide.order - 2;
    const beat = slide.order > 1 && beatIndex < beats.length ? asObject(beats[beatIndex]) : null;
    const storyEpisode = beatIndex >= beats.length ? asObject(storyEpisodes[beatIndex - beats.length]) : null;
    const moments = Array.isArray(storyEpisode?.moments) ? storyEpisode.moments.map(asObject) : [];
    const slideSource = beat ?? storyEpisode;
    const evidenceIds = Array.isArray(slideSource?.evidenceIds) ? slideSource.evidenceIds.map(String) : [];
    const eventIds = beat
      ? (Array.isArray(beat.eventIds) ? beat.eventIds.map(String) : [])
      : [...new Set(moments.flatMap(moment => (Array.isArray(moment?.eventIds) ? moment.eventIds.map(String) : [])))];
    return {
      ...slide,
      image_url: extractCanvasImageUrl(slide.canvas_data),
      content: slide.order === 1
        ? createCoverContent(story, episodes.length)
        : beat ? createBeatContent(beat) : createEpisodeContent(storyEpisode),
      events: describeEvents(eventIds, eventById),
      evidence: describeEvidence(evidenceIds, evidenceById, providerById),
    };
  });

  // The cover shows the season poster and the show's title logo when TMDB has them.
  const cover = slides[0];
  if (cover?.content?.kind === 'cover') {
    const tmdbId = Number(asObject(sourceSnapshot?.show)?.tmdbId);
    const coverArt = Number.isInteger(tmdbId) && tmdbId > 0 && recap.season
      ? await getRecapCoverArt(tmdbId, recap.season.number).catch(() => null)
      : null;
    const firstAired = Date.parse(String(season?.firstAired ?? ''));
    slides[0] = {
      ...cover,
      image_url: coverArt?.posterUrl ?? cover.image_url,
      content: {
        ...cover.content,
        logoUrl: coverArt?.logoUrl ?? null,
        year: Number.isFinite(firstAired) ? new Date(firstAired).getUTCFullYear() : null,
      },
    } as typeof cover;
  }

  return {
    id: recap.id,
    status: recap.status,
    unlockedBy: recap.unlocked_by_name,
    show: recap.show,
    // Trakt posters go through the image proxy, like the slide images.
    season: recap.season?.image ? { ...recap.season, image: toDisplayImageUrl(recap.season.image) } : recap.season,
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

function describeEvents(eventIds: string[], eventById: Map<string, Record<string, any> | null>) {
  return eventIds.map((id) => {
    const storyEvent = eventById.get(id);
    return storyEvent ? {
      id,
      title: String(storyEvent.title || ''),
      confidence: Number(storyEvent.confidence) || 0,
    } : null;
  }).filter(Boolean);
}

function describeEvidence(
  evidenceIds: string[],
  evidenceById: Map<string, Record<string, any>>,
  providerById: Map<string, Record<string, any> | null>,
) {
  return evidenceIds.map((id) => {
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
  }).filter(Boolean);
}

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

function createEpisodeContent(storyEpisode: Record<string, any> | null) {
  const episodeNumber = Number(storyEpisode?.episodeNumber);
  const moments = (Array.isArray(storyEpisode?.moments) ? storyEpisode.moments : [])
    .map(moment => String(asObject(moment)?.text || '').trim())
    .filter(Boolean);
  if (!storyEpisode?.headline || !Number.isInteger(episodeNumber) || !moments.length) return null;
  const partCount = Number(storyEpisode.partCount) || 1;
  return {
    kind: 'episode' as const,
    episodeNumber,
    headline: String(storyEpisode.headline),
    moments,
    part: Number(storyEpisode.part) || 1,
    partCount,
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
