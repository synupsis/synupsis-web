import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import OpenAI from 'openai';
import axios from 'axios';
import { defaultRecapPromptTemplate } from '~/lib/prompts/defaultPrompt';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event);
  const { showId, seasonId } = await readBody(event);

  if (!showId || !seasonId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing showId or seasonId' });
  }

  // Check if the default prompt should be enforced
  const {
    data: defaultPromptSetting,
    error: defaultPromptSettingError,
  } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'use_default_prompt')
    .single();

  if (defaultPromptSettingError && defaultPromptSettingError.code !== 'PGRST116') {
    console.error('Error fetching default prompt setting:', defaultPromptSettingError);
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch prompt settings.' });
  }

  const useDefaultPrompt = defaultPromptSetting?.value?.enabled === true;

  // Fetch active prompt
  let activePromptRecord: { id: string; content: string } | null = null;
  if (!useDefaultPrompt) {
    const { data: activePrompt, error: promptError } = await supabase
      .from('prompts')
      .select('id, content')
      .eq('is_active', true)
      .single();

    if (promptError && promptError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching active prompt:', promptError);
      // Not throwing an error, will use fallback in createPrompt
    } else {
      activePromptRecord = activePrompt;
    }
  }

  // Fetch show's trakt_id and season's number
  const { data: showDataFromDb, error: showErrorFromDb } = await supabase
    .from('show')
    .select('name, trakt_id, genres, summary, image') // Assuming these columns exist
    .eq('id', showId)
    .single();

  if (showErrorFromDb || !showDataFromDb || !showDataFromDb.trakt_id) {
    console.error('Failed to find show in DB or show is missing trakt_id:', showErrorFromDb);
    throw createError({ statusCode: 404, statusMessage: 'Show not found in database or is missing Trakt ID.' });
  }
  const showName = showDataFromDb.name;
  const traktShowId = showDataFromDb.trakt_id;

  const { data: seasonDataFromDb, error: seasonErrorFromDb } = await supabase
    .from('season')
    .select('number, first_aired, image') // Assuming columns exist
    .eq('id', seasonId)
    .single();

  if (seasonErrorFromDb || !seasonDataFromDb || !seasonDataFromDb.number) {
    console.error('Failed to find season in DB or season is missing number:', seasonErrorFromDb);
    throw createError({ statusCode: 404, statusMessage: 'Season not found in database or is missing season number.' });
  }
  const seasonNumber = seasonDataFromDb.number;

  // 2. Fetch season details from Trakt
  let seasonDetails: SeasonDetails;
  try {
    const clientId = process.env.TRAKT_CLIENT_ID;
    const headers = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': clientId,
    };

    const [
      episodesResponse,
      seasonMetaResponse,
      episodeImagesResponse,
    ] = await Promise.all([
      axios.get(`https://api.trakt.tv/shows/${traktShowId}/seasons/${seasonNumber}/episodes?extended=full`, { headers }),
      axios.get(`https://api.trakt.tv/shows/${traktShowId}/seasons/${seasonNumber}?extended=full`, { headers }),
      axios.get(`https://api.trakt.tv/shows/${traktShowId}/seasons/${seasonNumber}/episodes?extended=images`, { headers }).catch((err) => {
        console.warn('Failed to fetch episode images from Trakt (fallback to metadata only)', err?.message || err);
        return { data: [] };
      }),
    ]);

    const traktEpisodes = Array.isArray(episodesResponse.data) ? episodesResponse.data : [];
    if (traktEpisodes.length === 0) {
      throw new Error('Trakt returned no episodes for this season.');
    }

    const seasonMeta = Array.isArray(seasonMetaResponse.data)
      ? seasonMetaResponse.data[0]
      : seasonMetaResponse.data;
    const seasonOverview = seasonMeta?.overview ?? null;

    const episodeImageMap = extractEpisodeImageMap(episodeImagesResponse.data);

    const enrichedEpisodes = traktEpisodes.map((episode: any) => ({
      number: episode.number,
      name: episode.title,
      summary: episode.overview,
      image: normalizeImageUrl(episodeImageMap.get(episode.number)),
      runtime: episode.runtime,
      rating: episode.rating,
    }));

    seasonDetails = {
      number: seasonNumber,
      summary: seasonOverview,
      _embedded: {
        episodes: enrichedEpisodes,
      },
    };
  } catch (e) {
    console.error('Failed to fetch season details from Trakt:', e);
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch season data from Trakt.' });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const showImage = normalizeImageUrl(showDataFromDb.image);
  const seasonImage = normalizeImageUrl(seasonDataFromDb.image);
  const coverImageCandidate =
    seasonImage ||
    showImage ||
    seasonDetails._embedded.episodes.find((ep: EpisodeDetail) => ep.image)?.image ||
    null;

  // 3. Generate recap with OpenAI
  const toneGuidance = deriveToneGuidance(showDataFromDb.genres);
  const palette = determinePalette(showDataFromDb.genres);
  const promptTemplate = useDefaultPrompt ? defaultRecapPromptTemplate : activePromptRecord?.content;
  const prompt = createPrompt(seasonDetails, showName, promptTemplate, {
    showGenres: showDataFromDb.genres,
    showSummary: showDataFromDb.summary,
    seasonFirstAired: seasonDataFromDb.first_aired,
    toneGuidance,
    episodeCount: seasonDetails._embedded.episodes.length,
    episodes: seasonDetails._embedded.episodes,
  });
  let slides: StageSlide[] = [];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-nano-2025-04-14',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;

    if (!content) {
      throw new Error('OpenAI returned an empty content.');
    }
    const parsed = JSON.parse(content);
    const narrative = normalizeNarrativeResponse(parsed, seasonDetails._embedded.episodes, showName, seasonNumber);
    slides = buildRecapSlides(narrative, {
      showName,
      seasonNumber,
      episodes: seasonDetails._embedded.episodes,
      palette,
      coverImage: coverImageCandidate,
      toneGuidance,
    });

  } catch (e) {
    console.error('Failed to generate or process recap with OpenAI:', e);
    throw createError({ statusCode: 500, statusMessage: 'Failed to generate recap with AI.' });
  }

  // 4. Save to database
  const { data: recap, error: recapError } = await supabase
    .from('recap')
    .insert({
      show_id: showId,
      season_id: seasonId,
      user_id: user.id,
      status: 'published', // Set status to published directly
      prompt_id: useDefaultPrompt ? null : activePromptRecord?.id || null, // Save the ID of the active prompt
    })
    .select()
    .single();

  if (recapError) {
    console.error('Failed to create recap in DB:', recapError);
    throw createError({ statusCode: 500, statusMessage: 'Failed to save recap.' });
  }

  const slidesToInsert = slides.map((slide) => ({
    canvas_data: slide.canvas,
    recap_id: recap.id,
    order: slide.order,
  }));

  const { error: slidesError } = await supabase.from('slide').insert(slidesToInsert);

  if (slidesError) {
    console.error('Failed to save slides in DB:', slidesError);
    await supabase.from('recap').delete().eq('id', recap.id);
    throw createError({ statusCode: 500, statusMessage: 'Failed to save recap slides.' });
  }

  return { recapId: recap.id };
});

type PromptContext = {
  showGenres?: string[] | null;
  showSummary?: string | null;
  seasonFirstAired?: string | null;
  toneGuidance?: string;
  episodeCount?: number;
  episodes?: EpisodeDetail[];
};

type EpisodeDetail = {
  number: number;
  name: string;
  summary?: string | null;
  image?: string | null;
  runtime?: number | null;
  rating?: number | null;
};

type SeasonDetails = {
  number: number;
  summary?: string | null;
  _embedded: {
    episodes: EpisodeDetail[];
  };
};

type NormalizedNarrative = {
  cover: {
    title: string;
    subtitle: string;
    logline: string;
  };
  episodes: NormalizedEpisodeNarrative[];
};

type NormalizedEpisodeNarrative = {
  episodeNumber: number;
  title: string;
  headline: string;
  summary: string;
  tag?: string;
  tone?: string;
};

type StageSlide = {
  order: number;
  canvas: any;
};

type BuildSlidesContext = {
  showName: string;
  seasonNumber: number;
  episodes: EpisodeDetail[];
  palette: Palette;
  coverImage?: string | null;
  toneGuidance?: string;
};

type Palette = {
  gradient: [string, string];
  overlay: string;
  titleBackground: string;
  bodyBackground: string;
  titleText: string;
  bodyText: string;
  badgeBackground: string;
  badgeText: string;
  tagBackground: string;
  tagText: string;
};

const STAGE_WIDTH = 390;
const STAGE_HEIGHT = 844;
const TITLE_FONT_FAMILY = 'Fredoka One, Inter, sans-serif';
const BODY_FONT_FAMILY = 'Inter, sans-serif';

function createPrompt(
  season: SeasonDetails,
  showName: string,
  promptTemplate?: string,
  context: PromptContext = {},
): string {
  const episodes = context.episodes ?? season._embedded?.episodes ?? [];
  const episodeCount = context.episodeCount ?? episodes.length;

  const seasonSummary =
    clampText(sanitizeText(season?.summary) || sanitizeText(context.showSummary), 600) ||
    'Résumé indisponible.';

  const genreList = context.showGenres?.length ? context.showGenres.join(', ') : 'Genres indisponibles';
  const firstAired = context.seasonFirstAired ? safeFormatDate(context.seasonFirstAired) : 'Date inconnue';
  const showSummarySnippet = context.showSummary
    ? clampText(sanitizeText(context.showSummary), 260)
    : null;

  const quickFactsParts = [
    `- Show: ${showName}`,
    `- Season: ${season?.number ?? 'N/A'}`,
    `- Episodes this season: ${episodeCount}`,
    `- Genres: ${genreList}`,
    `- First aired: ${firstAired}`,
  ];
  if (showSummarySnippet) {
    quickFactsParts.push(`- Series overview: ${showSummarySnippet}`);
  }
  const seasonQuickFacts = quickFactsParts.join('\n');

  const episodeDetailedList = episodes.length
    ? episodes
        .map((episode) => {
          const summary = clampText(sanitizeText(episode.summary), 260) || 'Résumé indisponible.';
          const image = normalizeImageUrl(episode.image) ?? 'No dedicated artwork available.';
          return `Episode ${episode.number}: ${episode.name}\n  Summary: ${summary}\n  Image: ${image}`;
        })
        .join('\n')
    : 'No episode data available.';

  const toneGuidance = context.toneGuidance ?? deriveToneGuidance(context.showGenres);
  const template = promptTemplate ?? defaultRecapPromptTemplate;

  return template
    .replace(/{{seasonQuickFacts}}/g, seasonQuickFacts)
    .replace(/{{toneGuidance}}/g, toneGuidance)
    .replace(/{{seasonSummary}}/g, seasonSummary)
    .replace(/{{episodeDetailedList}}/g, episodeDetailedList)
    .replace(/{{episodeCount}}/g, String(episodeCount));
}

function sanitizeText(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampText(text: string | undefined, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text.trim();
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function safeFormatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().split('T')[0];
}

function deriveToneGuidance(genres?: string[] | null): string {
  if (!genres || genres.length === 0) {
    return 'Keep the narration neutral, cinematic, and emotionally engaging.';
  }

  const lowerGenres = genres.map((genre) => genre.toLowerCase());

  if (lowerGenres.includes('comedy')) {
    return 'Use an upbeat, witty tone while keeping the layout bright and inviting.';
  }
  if (lowerGenres.includes('drama')) {
    return 'Emphasize tension and emotional stakes with warm-to-dark gradients and a serious voice.';
  }
  if (lowerGenres.includes('thriller') || lowerGenres.includes('crime')) {
    return 'Lean into suspenseful wording and high-contrast visuals with bold accent colors.';
  }
  if (lowerGenres.includes('science-fiction') || lowerGenres.includes('sci-fi')) {
    return 'Adopt a futuristic voice and neon-accent palettes reminiscent of sci-fi interfaces.';
  }
  if (lowerGenres.includes('fantasy')) {
    return 'Favor mythical, evocative language and rich jewel-toned gradients.';
  }
  if (lowerGenres.includes('animation')) {
    return 'Keep the tone imaginative and colorful, leaning into playful wording.';
  }

  return 'Maintain a confident, story-driven tone with balanced contrast and readable typography.';
}

function determinePalette(genres?: string[] | null): Palette {
  const base: Palette = {
    gradient: ['#0f172a', '#020617'],
    overlay: 'rgba(10, 12, 22, 0.55)',
    titleBackground: 'rgba(15, 23, 42, 0.88)',
    bodyBackground: 'rgba(15, 23, 42, 0.82)',
    titleText: '#f9fafb',
    bodyText: '#e5e7eb',
    badgeBackground: 'rgba(59, 130, 246, 0.92)',
    badgeText: '#0b1120',
    tagBackground: 'rgba(250, 204, 21, 0.92)',
    tagText: '#111827',
  };

  if (!genres || genres.length === 0) return base;

  const lower = genres.map((genre) => genre.toLowerCase());

  if (lower.includes('comedy')) {
    return {
      gradient: ['#fde68a', '#f97316'],
      overlay: 'rgba(249, 115, 22, 0.25)',
      titleBackground: 'rgba(255, 255, 255, 0.9)',
      bodyBackground: 'rgba(255, 255, 255, 0.85)',
      titleText: '#0f172a',
      bodyText: '#1f2937',
      badgeBackground: 'rgba(14, 165, 233, 0.92)',
      badgeText: '#082f49',
      tagBackground: 'rgba(249, 115, 22, 0.92)',
      tagText: '#18181b',
    };
  }

  if (lower.includes('science-fiction') || lower.includes('sci-fi')) {
    return {
      gradient: ['#1c1f4a', '#111827'],
      overlay: 'rgba(11, 14, 38, 0.6)',
      titleBackground: 'rgba(30, 41, 59, 0.85)',
      bodyBackground: 'rgba(15, 23, 42, 0.78)',
      titleText: '#e0f2fe',
      bodyText: '#cbd5f5',
      badgeBackground: 'rgba(94, 234, 212, 0.9)',
      badgeText: '#022c22',
      tagBackground: 'rgba(129, 140, 248, 0.92)',
      tagText: '#111827',
    };
  }

  if (lower.includes('fantasy')) {
    return {
      gradient: ['#312e81', '#1e1b4b'],
      overlay: 'rgba(17, 16, 40, 0.55)',
      titleBackground: 'rgba(76, 29, 149, 0.85)',
      bodyBackground: 'rgba(67, 56, 202, 0.78)',
      titleText: '#ede9fe',
      bodyText: '#ddd6fe',
      badgeBackground: 'rgba(244, 114, 182, 0.9)',
      badgeText: '#4a044e',
      tagBackground: 'rgba(192, 132, 252, 0.92)',
      tagText: '#3b0764',
    };
  }

  if (lower.includes('thriller') || lower.includes('crime')) {
    return {
      gradient: ['#111827', '#020617'],
      overlay: 'rgba(2, 6, 23, 0.62)',
      titleBackground: 'rgba(15, 23, 42, 0.9)',
      bodyBackground: 'rgba(15, 23, 42, 0.82)',
      titleText: '#f8fafc',
      bodyText: '#e2e8f0',
      badgeBackground: 'rgba(248, 113, 113, 0.92)',
      badgeText: '#450a0a',
      tagBackground: 'rgba(248, 250, 252, 0.92)',
      tagText: '#0f172a',
    };
  }

  return base;
}

function normalizeImageUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  let normalized = url.trim();
  if (normalized.startsWith('//')) {
    normalized = `https:${normalized}`;
  } else if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }
  normalized = normalized.replace(/&?quality=\d+/g, '');
  return normalized;
}

function getProxiedImageUrl(url?: string | null): string | null {
  const normalized = normalizeImageUrl(url);
  if (!normalized) return null;
  return `/api/image-proxy/?url=${encodeURIComponent(normalized)}`;
}

function extractEpisodeImageMap(data: any): Map<number, string> {
  const map = new Map<number, string>();
  if (!Array.isArray(data)) return map;
  data.forEach((episode) => {
    const screenshot = episode?.images?.screenshot;
    const rawUrl = screenshot?.full || screenshot?.medium || screenshot?.thumb;
    if (rawUrl && typeof episode?.number === 'number') {
      const normalized = normalizeImageUrl(rawUrl);
      if (normalized) {
        map.set(episode.number, normalized);
      }
    }
  });
  return map;
}

function normalizeNarrativeResponse(
  raw: any,
  episodes: EpisodeDetail[],
  showName: string,
  seasonNumber: number,
): NormalizedNarrative {
  const cover = {
    title: clampText(raw?.cover?.title ?? `${showName} — Saison ${seasonNumber}`, 64),
    subtitle: clampText(raw?.cover?.subtitle ?? `Les moments clés de la saison ${seasonNumber}`, 96),
    logline: clampText(raw?.cover?.logline ?? 'Résumé indisponible pour cette saison.', 200),
  };

  const rawEpisodes: any[] = Array.isArray(raw?.episodes) ? raw.episodes : [];
  const normalizedEpisodes = episodes.map((episode, index) => {
    const match =
      rawEpisodes.find((item) => Number(item?.episodeNumber) === episode.number) ??
      rawEpisodes[index] ??
      {};

    return {
      episodeNumber: episode.number,
      title: clampText(match.title ?? episode.name ?? `Episode ${episode.number}`, 60),
      headline: clampText(match.headline ?? match.title ?? episode.name ?? `Episode ${episode.number}`, 60),
      summary: clampText(
        sanitizeText(match.summary) || sanitizeText(episode.summary) || 'Résumé indisponible pour cet épisode.',
        240,
      ),
      tag: clampText(match.tag ?? '', 20),
      tone: clampText(match.tone ?? '', 28),
    };
  });

  return { cover, episodes: normalizedEpisodes };
}

function buildRecapSlides(narrative: NormalizedNarrative, context: BuildSlidesContext): StageSlide[] {
  const slides: StageSlide[] = [];

  slides.push({
    order: 1,
    canvas: createCoverCanvas({
      cover: narrative.cover,
      palette: context.palette,
      coverImage: context.coverImage ?? null,
      showName: context.showName,
      seasonNumber: context.seasonNumber,
    }),
  });

  const episodeMap = new Map<number, EpisodeDetail>();
  context.episodes.forEach((episode) => episodeMap.set(episode.number, episode));

  narrative.episodes.forEach((episodeNarrative, idx) => {
    const episodeData = episodeMap.get(episodeNarrative.episodeNumber) ?? context.episodes[idx];
    slides.push({
      order: slides.length + 1,
      canvas: createEpisodeCanvas({
        order: slides.length + 1,
        episodeNarrative,
        episodeData,
        palette: context.palette,
        backgroundImage: episodeData?.image ?? context.coverImage ?? null,
      }),
    });
  });

  return slides;
}

type CoverCanvasOptions = {
  cover: NormalizedNarrative['cover'];
  palette: Palette;
  coverImage: string | null;
  showName: string;
  seasonNumber: number;
};

function createCoverCanvas({
  cover,
  palette,
  coverImage,
  showName,
  seasonNumber,
}: CoverCanvasOptions) {
  const layerChildren: any[] = [];
  layerChildren.push(...createBackgroundNodes(coverImage, palette));

  let currentY = 96;

  const titleGroup = createTextGroup({
    id: 'group-slide-1-title',
    text: cover.title || `${showName} — Saison ${seasonNumber}`,
    y: currentY,
    fontSize: 44,
    lineHeight: 1.05,
    fontFamily: TITLE_FONT_FAMILY,
    textColor: palette.titleText,
    backgroundFill: palette.titleBackground,
    paddingX: 26,
    paddingY: 22,
    maxWidth: 320,
    align: 'center',
    centerHorizontally: true,
    cornerRadius: 24,
    draggable: true,
  });
  layerChildren.push(titleGroup.node);
  currentY += titleGroup.totalHeight + 28;

  if (cover.subtitle) {
    const subtitleGroup = createTextGroup({
      id: 'group-slide-1-subtitle',
      text: cover.subtitle,
      y: currentY,
      fontSize: 28,
      lineHeight: 1.18,
      fontFamily: BODY_FONT_FAMILY,
      textColor: palette.bodyText,
      backgroundFill: palette.bodyBackground,
      paddingX: 24,
      paddingY: 18,
      maxWidth: 320,
      align: 'center',
      centerHorizontally: true,
      cornerRadius: 22,
      draggable: true,
    });
    layerChildren.push(subtitleGroup.node);
    currentY += subtitleGroup.totalHeight + 24;
  }

  if (cover.logline) {
    const loglineGroup = createTextGroup({
      id: 'group-slide-1-logline',
      text: cover.logline,
      y: currentY,
      fontSize: 22,
      lineHeight: 1.32,
      fontFamily: BODY_FONT_FAMILY,
      textColor: palette.bodyText,
      backgroundFill: palette.bodyBackground,
      paddingX: 24,
      paddingY: 20,
      maxWidth: 320,
      align: 'center',
      centerHorizontally: true,
      cornerRadius: 20,
      draggable: true,
    });
    layerChildren.push(loglineGroup.node);
  }

  return createStage(layerChildren);
}

type EpisodeCanvasOptions = {
  order: number;
  episodeNarrative: NormalizedEpisodeNarrative;
  episodeData?: EpisodeDetail;
  palette: Palette;
  backgroundImage: string | null;
};

function createEpisodeCanvas({
  order,
  episodeNarrative,
  episodeData,
  palette,
  backgroundImage,
}: EpisodeCanvasOptions) {
  const layerChildren: any[] = [];
  layerChildren.push(...createBackgroundNodes(backgroundImage, palette));

  let currentY = 48;

  const episodeBadge = createBadgeGroup({
    id: `group-slide-${order}-badge`,
    text: `Episode ${episodeNarrative.episodeNumber.toString().padStart(2, '0')}`,
    y: currentY,
    palette,
  });
  layerChildren.push(episodeBadge.node);
  currentY += episodeBadge.totalHeight + 20;

  const headlineGroup = createTextGroup({
    id: `group-slide-${order}-headline`,
    text: episodeNarrative.headline || episodeNarrative.title,
    y: currentY,
    fontSize: 34,
    lineHeight: 1.16,
    fontFamily: TITLE_FONT_FAMILY,
    textColor: palette.titleText,
    backgroundFill: palette.titleBackground,
    paddingX: 24,
    paddingY: 20,
    maxWidth: 330,
    align: 'left',
    cornerRadius: 22,
    draggable: true,
  });
  layerChildren.push(headlineGroup.node);
  currentY += headlineGroup.totalHeight + 20;

  const summaryGroup = createTextGroup({
    id: `group-slide-${order}-summary`,
    text: episodeNarrative.summary,
    y: currentY,
    fontSize: 22,
    lineHeight: 1.32,
    fontFamily: BODY_FONT_FAMILY,
    textColor: palette.bodyText,
    backgroundFill: palette.bodyBackground,
    paddingX: 24,
    paddingY: 20,
    maxWidth: 330,
    align: 'left',
    cornerRadius: 20,
    draggable: true,
  });
  layerChildren.push(summaryGroup.node);

  if (episodeNarrative.tag) {
    const tagGroup = createPillGroup({
      id: `group-slide-${order}-tag`,
      text: episodeNarrative.tag,
      y: headlineGroup.node.attrs.y - 12,
      palette,
      alignRight: true,
    });
    layerChildren.push(tagGroup.node);
  }

  if (episodeData?.runtime || episodeData?.rating) {
    const details: string[] = [];
    if (episodeData.runtime) {
      details.push(`${episodeData.runtime} min`);
    }
    if (episodeData.rating) {
      details.push(`Note: ${Math.round(episodeData.rating * 10) / 10}`);
    }
    if (details.length) {
      const infoGroup = createPillGroup({
        id: `group-slide-${order}-meta`,
        text: details.join(' • '),
        y: episodeBadge.node.attrs.y,
        palette,
        alignRight: true,
        backgroundOverride: 'rgba(15, 23, 42, 0.55)',
      });
      layerChildren.push(infoGroup.node);
    }
  }

  return createStage(layerChildren);
}

function createStage(children: any[]) {
  return {
    className: 'Stage',
    attrs: {
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      scaleX: 1,
      scaleY: 1,
    },
    children: [
      {
        className: 'Layer',
        children,
      },
    ],
  };
}

function createBackgroundNodes(imageSrc: string | null, palette: Palette): any[] {
  const nodes: any[] = [];
  if (imageSrc) {
    nodes.push({
      className: 'Image',
      attrs: {
        x: 0,
        y: 0,
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        src: getProxiedImageUrl(imageSrc),
        listening: false,
      },
    });
  } else {
    nodes.push({
      className: 'Rect',
      attrs: {
        x: 0,
        y: 0,
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        fillLinearGradientStartPoint: { x: 0, y: 0 },
        fillLinearGradientEndPoint: { x: 0, y: STAGE_HEIGHT },
        fillLinearGradientColorStops: [0, palette.gradient[0], 1, palette.gradient[1]],
        listening: false,
      },
    });
  }

  nodes.push({
    className: 'Rect',
    attrs: {
      x: 0,
      y: 0,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      fill: palette.overlay,
      listening: false,
    },
  });

  return nodes;
}

type TextGroupOptions = {
  id: string;
  text: string;
  y: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  textColor: string;
  backgroundFill: string;
  paddingX?: number;
  paddingY?: number;
  maxWidth: number;
  align?: 'left' | 'center' | 'right';
  centerHorizontally?: boolean;
  cornerRadius?: number;
  draggable?: boolean;
};

type TextGroupResult = {
  node: any;
  totalHeight: number;
  width: number;
};

function createTextGroup(options: TextGroupOptions): TextGroupResult {
  const paddingX = options.paddingX ?? 20;
  const paddingY = options.paddingY ?? 16;
  const text = options.text?.trim() ?? '';
  const metrics = estimateTextMetrics(text, {
    fontSize: options.fontSize,
    lineHeight: options.lineHeight,
    maxWidth: options.maxWidth,
  });

  const rectWidth = metrics.width + paddingX * 2;
  const rectHeight = metrics.height + paddingY * 2;

  const x = options.centerHorizontally
    ? Math.max((STAGE_WIDTH - rectWidth) / 2, 24)
    : 24;

  const group = {
    className: 'Group',
    attrs: {
      id: options.id,
      name: options.id,
      x,
      y: options.y,
      draggable: options.draggable ?? true,
    },
    children: [
      {
        className: 'Rect',
        attrs: {
          width: rectWidth,
          height: rectHeight,
          fill: options.backgroundFill,
          cornerRadius: options.cornerRadius ?? 20,
        },
      },
      {
        className: 'Text',
        attrs: {
          x: paddingX,
          y: paddingY,
          width: metrics.width,
          text,
          fontSize: options.fontSize,
          lineHeight: options.lineHeight,
          fontFamily: options.fontFamily,
          fill: options.textColor,
          wrap: 'word',
          align: options.align ?? 'left',
        },
      },
    ],
  };

  return { node: group, totalHeight: rectHeight, width: rectWidth };
}

type BadgeGroupOptions = {
  id: string;
  text: string;
  y: number;
  palette: Palette;
};

function createBadgeGroup(options: BadgeGroupOptions): TextGroupResult {
  return createPillGroup({
    id: options.id,
    text: options.text,
    y: options.y,
    palette: options.palette,
    alignRight: false,
    fontSize: 18,
    paddingX: 18,
    paddingY: 10,
  });
}

type PillGroupOptions = {
  id: string;
  text: string;
  y: number;
  palette: Palette;
  alignRight: boolean;
  fontSize?: number;
  paddingX?: number;
  paddingY?: number;
  backgroundOverride?: string;
};

function createPillGroup(options: PillGroupOptions): TextGroupResult {
  const text = options.text?.trim();
  if (!text) {
    return {
      node: {
        className: 'Group',
        attrs: { id: options.id, name: options.id, x: 24, y: options.y, draggable: true },
        children: [],
      },
      totalHeight: 0,
      width: 0,
    };
  }

  const fontSize = options.fontSize ?? 17;
  const paddingX = options.paddingX ?? 14;
  const paddingY = options.paddingY ?? 8;

  const metrics = estimateTextMetrics(text, {
    fontSize,
    lineHeight: 1.05,
    maxWidth: 200,
  });

  const rectWidth = metrics.width + paddingX * 2;
  const rectHeight = metrics.height + paddingY * 2;

  const x = options.alignRight
    ? STAGE_WIDTH - rectWidth - 24
    : 24;

  const group = {
    className: 'Group',
    attrs: {
      id: options.id,
      name: options.id,
      x,
      y: options.y,
      draggable: true,
    },
    children: [
      {
        className: 'Rect',
        attrs: {
          width: rectWidth,
          height: rectHeight,
          fill: options.backgroundOverride ?? (options.alignRight ? options.palette.tagBackground : options.palette.badgeBackground),
          cornerRadius: rectHeight / 2,
        },
      },
      {
        className: 'Text',
        attrs: {
          x: paddingX,
          y: paddingY,
          width: metrics.width,
          text,
          fontSize,
          fontFamily: BODY_FONT_FAMILY,
          lineHeight: 1.05,
          fill: options.backgroundOverride
            ? '#f9fafb'
            : (options.alignRight ? options.palette.tagText : options.palette.badgeText),
          wrap: 'word',
          align: 'center',
        },
      },
    ],
  };

  return { node: group, totalHeight: rectHeight, width: rectWidth };
}

type TextMetricsOptions = {
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
};

function estimateTextMetrics(text: string, options: TextMetricsOptions) {
  const sanitized = text || '';
  const averageCharWidth = options.fontSize * 0.55;
  const maxCharsPerLine = Math.max(6, Math.floor(options.maxWidth / Math.max(averageCharWidth, 1)));

  const paragraphs = sanitized.split(/\n+/g).filter(Boolean);
  let lineCount = Math.max(paragraphs.length, 1);
  let longestLineChars = 0;

  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let currentLineCount = 0;

    words.forEach((word) => {
      if (currentLineCount === 0) {
        currentLineCount = word.length;
      } else if (currentLineCount + 1 + word.length > maxCharsPerLine) {
        lineCount += 1;
        longestLineChars = Math.max(longestLineChars, currentLineCount);
        currentLineCount = word.length;
      } else {
        currentLineCount += 1 + word.length;
      }
    });

    longestLineChars = Math.max(longestLineChars, currentLineCount);
  });

  const height = Math.max(lineCount, 1) * options.fontSize * options.lineHeight;
  const calculatedWidth = Math.min(options.maxWidth, Math.max(longestLineChars * averageCharWidth, options.fontSize * 2));

  return {
    width: calculatedWidth,
    height,
    lineCount: Math.max(lineCount, 1),
  };
}
