import type { H3Event } from 'h3';
import { createError, readBody } from 'h3';
import { serverSupabaseServiceRole } from '#supabase/server';
import type { Database, Json } from '~/types/database.types';
import type { RecapStory } from '~/types/recap-story.types';
import { requireAdminUser } from '~/server/utils/require-admin';

type EditorSlideInput = {
  canvas?: string | Json;
};

type EditorSaveBody = {
  recapId?: string | null;
  showId?: string;
  seasonId?: string;
  slides?: EditorSlideInput[];
  storyData?: unknown;
};

type ExistingRecap = Database['public']['Tables']['recap']['Row'];

export async function saveRecapFromEditor(event: H3Event, publish: boolean) {
  const user = await requireAdminUser(event);
  const body = await readBody<EditorSaveBody>(event);
  const { recapId, showId, seasonId } = body;

  if (!showId || !seasonId || !Array.isArray(body.slides) || body.slides.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'showId, seasonId and at least one slide are required.',
    });
  }

  const storyData = validateStoryData(body.storyData);
  if (storyData && body.slides.length !== storyData.beats.length + 1) {
    throw createError({
      statusCode: 400,
      statusMessage: 'The semantic story must contain exactly one cover slide plus one slide per beat.',
    });
  }
  const slideCanvases = body.slides.map((slide, index) => parseCanvas(slide.canvas, index));
  const service = serverSupabaseServiceRole<Database>(event);

  let recap: ExistingRecap | null = null;
  let createdRecap = false;

  if (recapId) {
    const { data, error } = await service.from('recap').select('*').eq('id', recapId).maybeSingle();
    if (error) throwDatabaseError('Could not load the recap.', error);
    if (!data || data.show_id !== showId || data.season_id !== seasonId) {
      throw createError({ statusCode: 404, statusMessage: 'Recap not found for this show and season.' });
    }
    recap = data;
  } else {
    const { data, error } = await service
      .from('recap')
      .select('*')
      .eq('show_id', showId)
      .eq('season_id', seasonId)
      .eq('user_id', user.sub)
      .eq('is_canonical', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throwDatabaseError('Could not look up the recap.', error);
    recap = data;
  }

  if (!recap) {
    const { data, error } = await service
      .from('recap')
      .insert({
        show_id: showId,
        season_id: seasonId,
        user_id: user.sub,
        status: publish ? 'published' : 'draft',
        is_canonical: false,
        story_data: storyData as unknown as Json,
      })
      .select('*')
      .single();
    if (error || !data) throwDatabaseError('Could not create the recap.', error);
    recap = data;
    createdRecap = true;
  }

  const { data: oldSlides, error: oldSlidesError } = await service
    .from('slide')
    .select('id')
    .eq('recap_id', recap.id);
  if (oldSlidesError) throwDatabaseError('Could not load the existing slides.', oldSlidesError);

  const slideRows = slideCanvases.map((canvas, index) => ({
    recap_id: recap!.id,
    canvas_data: canvas,
    order: storyData ? index + 1 : index,
  }));
  const { data: insertedSlides, error: insertError } = await service
    .from('slide')
    .insert(slideRows)
    .select('id');

  if (insertError || !insertedSlides) {
    if (createdRecap) await service.from('recap').delete().eq('id', recap.id);
    throwDatabaseError('Could not save the new slides.', insertError);
  }

  const oldSlideIds = (oldSlides || []).map(slide => slide.id);
  if (oldSlideIds.length > 0) {
    const { error: deleteError } = await service.from('slide').delete().in('id', oldSlideIds);
    if (deleteError) {
      await service.from('slide').delete().in('id', insertedSlides.map(slide => slide.id));
      throwDatabaseError('Could not replace the existing slides.', deleteError);
    }
  }

  const storyChanged = !jsonValuesEqual(
    getEditorialStoryProjection(recap.story_data),
    getEditorialStoryProjection(storyData),
  );
  const qualityReport = storyChanged
    ? markEditorialVerificationStale(recap.quality_report)
    : recap.quality_report;
  const nextStatus = publish ? 'published' : recap.status;
  const { error: updateError } = await service
    .from('recap')
    .update({
      status: nextStatus,
      story_data: storyData as unknown as Json,
      quality_report: qualityReport,
    })
    .eq('id', recap.id);

  if (updateError) throwDatabaseError('Slides were saved, but recap metadata could not be updated.', updateError);

  return {
    recapId: recap.id,
    status: nextStatus,
    storyVerificationStale: storyChanged && storyData !== null,
  };
}

function validateStoryData(value: unknown): RecapStory | null {
  if (value == null) return null;
  if (!isObject(value) || !isObject(value.cover) || !Array.isArray(value.beats)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid semantic story data.' });
  }

  const cover = {
    title: readStoryText(value.cover.title, 'cover title', 90, true),
    subtitle: readStoryText(value.cover.subtitle, 'cover subtitle', 140),
    logline: readStoryText(value.cover.logline, 'cover introduction', 360),
  };
  const beats = value.beats.map((rawBeat, index) => {
    if (!isObject(rawBeat)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid story beat at index ${index}.` });
    }
    const episodeNumbers = readPositiveIntegers(rawBeat.episodeNumbers);
    const imageEpisodeNumber = Number(rawBeat.imageEpisodeNumber);
    return {
      headline: readStoryText(rawBeat.headline, `beat ${index + 1} headline`, 90, true),
      narration: readStoryText(rawBeat.narration, `beat ${index + 1} narration`, 520, true),
      tag: readStoryText(rawBeat.tag, `beat ${index + 1} tag`, 60),
      episodeNumbers,
      imageEpisodeNumber: Number.isInteger(imageEpisodeNumber) && imageEpisodeNumber > 0
        ? imageEpisodeNumber
        : (episodeNumbers[0] || 1),
      eventIds: readStringArray(rawBeat.eventIds),
      evidenceIds: readStringArray(rawBeat.evidenceIds),
    };
  });

  return {
    locale: typeof value.locale === 'string' && value.locale.trim() ? value.locale : 'fr',
    spoilerScope: 'through-season',
    cover,
    beats,
  };
}

function readStoryText(value: unknown, field: string, maxLength: number, required = false) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (required && !text) {
    throw createError({ statusCode: 400, statusMessage: `The ${field} cannot be empty.` });
  }
  if (text.length > maxLength) {
    throw createError({ statusCode: 400, statusMessage: `The ${field} exceeds ${maxLength} characters.` });
  }
  return text;
}

function readPositiveIntegers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter(number => Number.isInteger(number) && number > 0))]
    .sort((a, b) => a - b);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean))];
}

function parseCanvas(value: string | Json | undefined, index: number): Json {
  if (value == null || value === '') return {};
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as Json;
  } catch {
    throw createError({ statusCode: 400, statusMessage: `Slide ${index + 1} contains invalid canvas data.` });
  }
}

function markEditorialVerificationStale(value: Json | null): Json {
  const quality = isObject(value) ? value : {};
  return {
    ...quality,
    editorial: {
      edited: true,
      editedAt: new Date().toISOString(),
      automaticVerificationStale: true,
    },
  } as Json;
}

function getEditorialStoryProjection(value: unknown) {
  const story = isObject(value) ? value : null;
  const cover = isObject(story?.cover) ? story.cover : null;
  const beats = Array.isArray(story?.beats) ? story.beats : [];
  if (!story || !cover) return null;
  return {
    cover: {
      title: typeof cover.title === 'string' ? cover.title.trim() : '',
      subtitle: typeof cover.subtitle === 'string' ? cover.subtitle.trim() : '',
      logline: typeof cover.logline === 'string' ? cover.logline.trim() : '',
    },
    beats: beats.map((item) => {
      const beat = isObject(item) ? item : {};
      return {
        headline: typeof beat.headline === 'string' ? beat.headline.trim() : '',
        narration: typeof beat.narration === 'string' ? beat.narration.trim() : '',
        tag: typeof beat.tag === 'string' ? beat.tag.trim() : '',
        episodeNumbers: readPositiveIntegers(beat.episodeNumbers),
      };
    }),
  };
}

function jsonValuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function throwDatabaseError(message: string, error: unknown): never {
  console.error(message, error);
  throw createError({ statusCode: 500, statusMessage: message });
}
