import axios from 'axios';
import OpenAI from 'openai';
import { defaultRecapPromptTemplate } from '~/lib/prompts/defaultPrompt';

export const RECAP_FORMAT_VERSION = 3;
export const RECAP_PROMPT_VERSION = 'recap-story-v3-evidence';
export const RECAP_LOCALE = 'fr';

const STAGE_WIDTH = 390;
const STAGE_HEIGHT = 844;
const TITLE_FONT_FAMILY = 'Fredoka, Inter, sans-serif';
const BODY_FONT_FAMILY = 'Inter, sans-serif';

export type EpisodeSource = {
  number: number;
  title: string;
  overview: string | null;
  image: string | null;
  runtime: number | null;
  rating: number | null;
  traktId: number | null;
  evidence: RecapEvidence[];
};

export type RecapEvidence = {
  id: string;
  providerId: 'trakt' | 'tmdb' | 'tvmaze' | 'editorial' | 'official' | 'transcript';
  kind: 'episode-synopsis' | 'season-synopsis' | 'official-recap' | 'transcript-extract';
  episodeNumber: number | null;
  locale: string;
  text: string;
  sourceUrl: string | null;
  trustTier: 'reference' | 'editorial' | 'official' | 'licensed-transcript';
};

export type RecapSourceProvider = {
  id: RecapEvidence['providerId'];
  label: string;
  fetchedAt: string;
  sourceUrl: string | null;
  termsUrl: string | null;
};

export type RecapSourceSnapshot = {
  provider: 'multi-source';
  fetchedAt: string;
  providers: RecapSourceProvider[];
  show: {
    id: string;
    traktId: number;
    tmdbId: number | null;
    tvdbId: number | null;
    imdbId: string | null;
    name: string;
    genres: string[];
    overview: string | null;
    image: string | null;
  };
  season: {
    id: string;
    number: number;
    firstAired: string | null;
    image: string | null;
    evidence: RecapEvidence[];
  };
  episodes: EpisodeSource[];
};

export type RecapStoryBeat = {
  headline: string;
  narration: string;
  tag: string;
  episodeNumbers: number[];
  imageEpisodeNumber: number;
  evidenceIds: string[];
};

export type RecapStory = {
  locale: string;
  spoilerScope: 'through-season';
  cover: {
    title: string;
    subtitle: string;
    logline: string;
  };
  beats: RecapStoryBeat[];
};

export type RecapQualityReport = {
  score: number;
  publishable: boolean;
  sourceCoverage: number;
  episodeCoverage: number;
  referenceValidity: number;
  evidenceCoverage: number;
  sourceRichness: number;
  sourceDiversity: number;
  issues: string[];
};

export type GeneratedSlide = {
  order: number;
  canvas: Record<string, unknown>;
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

type TextGroupOptions = {
  id: string;
  text: string;
  x?: number;
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
  node: Record<string, unknown>;
  totalHeight: number;
  width: number;
};

export const recapStoryJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['cover', 'beats'],
  properties: {
    cover: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'subtitle', 'logline'],
      properties: {
        title: { type: 'string' },
        subtitle: { type: 'string' },
        logline: { type: 'string' },
      },
    },
    beats: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['headline', 'narration', 'tag', 'episodeNumbers', 'imageEpisodeNumber', 'evidenceIds'],
        properties: {
          headline: { type: 'string' },
          narration: { type: 'string' },
          tag: { type: 'string' },
          episodeNumbers: {
            type: 'array',
            items: { type: 'integer' },
          },
          imageEpisodeNumber: { type: 'integer' },
          evidenceIds: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  },
} as const;

export function getRecapModel(): string {
  return process.env.OPENAI_RECAP_MODEL || 'gpt-5.6';
}

export function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }
  return new OpenAI({ apiKey });
}

export async function fetchRecapSourceSnapshot(input: {
  showId: string;
  seasonId: string;
  showName: string;
  showTraktId: number;
  showGenres: string[] | null;
  showOverview: string | null;
  showImage: string | null;
  seasonNumber: number;
  seasonFirstAired: string | null;
  seasonImage: string | null;
}): Promise<RecapSourceSnapshot> {
  const clientId = process.env.TRAKT_CLIENT_ID;
  if (!clientId) {
    throw new Error('TRAKT_CLIENT_ID is not configured.');
  }

  const fetchedAt = new Date().toISOString();
  const headers = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': clientId,
  };
  const seasonUrl = `https://api.trakt.tv/shows/${input.showTraktId}/seasons/${input.seasonNumber}?extended=full`;
  const showUrl = `https://api.trakt.tv/shows/${input.showTraktId}?extended=full`;
  const [seasonResponse, showResponse] = await Promise.all([
    axios.get(seasonUrl, { headers, timeout: 15_000 }),
    axios.get(showUrl, { headers, timeout: 15_000 }),
  ]);
  const traktEpisodes = Array.isArray(seasonResponse.data) ? seasonResponse.data : [];
  const traktShow = showResponse.data || {};

  if (traktEpisodes.length === 0) {
    throw new Error('Trakt returned no episodes for this season.');
  }

  const tmdbId = toPositiveInteger(traktShow?.ids?.tmdb);
  const tvdbId = toPositiveInteger(traktShow?.ids?.tvdb);
  const imdbId = sanitizeText(traktShow?.ids?.imdb) || null;
  const traktSlug = sanitizeText(traktShow?.ids?.slug);
  const providers: RecapSourceProvider[] = [{
    id: 'trakt',
    label: 'Trakt',
    fetchedAt,
    sourceUrl: traktSlug ? `https://trakt.tv/shows/${traktSlug}` : null,
    termsUrl: 'https://trakt.tv/terms',
  }];

  const episodes = traktEpisodes
    .filter((episode: any) => Number.isInteger(episode?.number) && episode.number > 0)
    .map((episode: any): EpisodeSource => {
      const overview = sanitizeText(episode.overview) || null;
      return {
        number: episode.number,
        title: sanitizeText(episode.title) || `Épisode ${episode.number}`,
        overview,
        image: extractTraktEpisodeImage(episode.images),
        runtime: typeof episode.runtime === 'number' ? episode.runtime : null,
        rating: typeof episode.rating === 'number' ? episode.rating : null,
        traktId: typeof episode.ids?.trakt === 'number' ? episode.ids.trakt : null,
        evidence: overview ? [{
          id: `trakt-e${episode.number}-overview`,
          providerId: 'trakt',
          kind: 'episode-synopsis',
          episodeNumber: episode.number,
          locale: 'en',
          text: overview,
          sourceUrl: traktSlug
            ? `https://trakt.tv/shows/${traktSlug}/seasons/${input.seasonNumber}/episodes/${episode.number}`
            : null,
          trustTier: 'reference',
        }] : [],
      };
    })
    .sort((first: EpisodeSource, second: EpisodeSource) => first.number - second.number);

  if (episodes.length === 0) {
    throw new Error('Trakt returned no regular episodes for this season.');
  }

  const enrichmentResults = await Promise.all([
    fetchTmdbEvidence({ tmdbId, seasonNumber: input.seasonNumber, fetchedAt }),
    fetchTvMazeEvidence({ tvdbId, imdbId, seasonNumber: input.seasonNumber, fetchedAt }),
  ]);
  const seasonEvidence: RecapEvidence[] = [];

  enrichmentResults.filter(Boolean).forEach((enrichment) => {
    if (!enrichment) return;
    providers.push(enrichment.provider);
    seasonEvidence.push(...enrichment.seasonEvidence);
    enrichment.episodeEvidence.forEach((items, episodeNumber) => {
      const episode = episodes.find(candidate => candidate.number === episodeNumber);
      if (!episode) return;
      episode.evidence = deduplicateEvidence([...episode.evidence, ...items]);
      episode.overview = selectPrimaryOverview(episode.evidence) || episode.overview;
    });
  });

  return {
    provider: 'multi-source',
    fetchedAt,
    providers,
    show: {
      id: input.showId,
      traktId: input.showTraktId,
      tmdbId,
      tvdbId,
      imdbId,
      name: input.showName,
      genres: input.showGenres ?? [],
      overview: sanitizeText(input.showOverview) || null,
      image: normalizeImageUrl(input.showImage),
    },
    season: {
      id: input.seasonId,
      number: input.seasonNumber,
      firstAired: input.seasonFirstAired,
      image: normalizeImageUrl(input.seasonImage),
      evidence: deduplicateEvidence(seasonEvidence),
    },
    episodes,
  };
}

type SourceEnrichment = {
  provider: RecapSourceProvider;
  seasonEvidence: RecapEvidence[];
  episodeEvidence: Map<number, RecapEvidence[]>;
};

async function fetchTmdbEvidence(input: {
  tmdbId: number | null;
  seasonNumber: number;
  fetchedAt: string;
}): Promise<SourceEnrichment | null> {
  const configuredAccessToken = process.env.TMDB_API_READ_ACCESS_TOKEN;
  const configuredApiKey = process.env.TMDB_API_KEY;
  const accessToken = configuredAccessToken
    || (looksLikeTmdbReadAccessToken(configuredApiKey) ? configuredApiKey : undefined);
  const apiKey = accessToken ? undefined : configuredApiKey;
  if (!input.tmdbId || (!accessToken && !apiKey)) return null;

  const url = `https://api.themoviedb.org/3/tv/${input.tmdbId}/season/${input.seasonNumber}`;
  const requestConfig = {
    timeout: 15_000,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    params: apiKey ? { api_key: apiKey } : undefined,
  };

  try {
    const [frenchResponse, englishResponse] = await Promise.all([
      axios.get(url, { ...requestConfig, params: { ...requestConfig.params, language: 'fr-FR' } }),
      axios.get(url, { ...requestConfig, params: { ...requestConfig.params, language: 'en-US' } }),
    ]);
    const episodeEvidence = new Map<number, RecapEvidence[]>();
    const seasonEvidence: RecapEvidence[] = [];

    const appendResponseEvidence = (data: any, locale: 'fr' | 'en') => {
      const seasonOverview = sanitizeText(data?.overview);
      if (seasonOverview) {
        seasonEvidence.push({
          id: `tmdb-s${input.seasonNumber}-overview-${locale}`,
          providerId: 'tmdb',
          kind: 'season-synopsis',
          episodeNumber: null,
          locale,
          text: seasonOverview,
          sourceUrl: `https://www.themoviedb.org/tv/${input.tmdbId}/season/${input.seasonNumber}`,
          trustTier: 'reference',
        });
      }

      (Array.isArray(data?.episodes) ? data.episodes : []).forEach((episode: any) => {
        const episodeNumber = toPositiveInteger(episode?.episode_number);
        const overview = sanitizeText(episode?.overview);
        if (!episodeNumber || !overview) return;
        const evidence: RecapEvidence = {
          id: `tmdb-e${episodeNumber}-overview-${locale}`,
          providerId: 'tmdb',
          kind: 'episode-synopsis',
          episodeNumber,
          locale,
          text: overview,
          sourceUrl: `https://www.themoviedb.org/tv/${input.tmdbId}/season/${input.seasonNumber}/episode/${episodeNumber}`,
          trustTier: 'reference',
        };
        episodeEvidence.set(episodeNumber, [...(episodeEvidence.get(episodeNumber) || []), evidence]);
      });
    };

    appendResponseEvidence(frenchResponse.data, 'fr');
    appendResponseEvidence(englishResponse.data, 'en');

    return {
      provider: {
        id: 'tmdb',
        label: 'The Movie Database (TMDB)',
        fetchedAt: input.fetchedAt,
        sourceUrl: `https://www.themoviedb.org/tv/${input.tmdbId}/season/${input.seasonNumber}`,
        termsUrl: 'https://www.themoviedb.org/api-terms-of-use',
      },
      seasonEvidence: deduplicateEvidence(seasonEvidence),
      episodeEvidence,
    };
  } catch (error) {
    const message = axios.isAxiosError(error) && error.response?.status === 401
      ? 'TMDB rejected the configured credential. Use TMDB_API_READ_ACCESS_TOKEN for a long v4 Read Access Token, or TMDB_API_KEY for a short v3 API key.'
      : toErrorMessage(error);
    console.warn('TMDB recap enrichment is unavailable; continuing with other sources.', message);
    return null;
  }
}

async function fetchTvMazeEvidence(input: {
  tvdbId: number | null;
  imdbId: string | null;
  seasonNumber: number;
  fetchedAt: string;
}): Promise<SourceEnrichment | null> {
  if (!input.tvdbId && !input.imdbId) return null;

  try {
    const lookupParams = input.tvdbId ? { thetvdb: input.tvdbId } : { imdb: input.imdbId };
    const { data: show } = await axios.get('https://api.tvmaze.com/lookup/shows', {
      params: lookupParams,
      timeout: 15_000,
    });
    const showId = toPositiveInteger(show?.id);
    if (!showId) return null;

    const { data } = await axios.get(`https://api.tvmaze.com/shows/${showId}/episodes`, {
      params: { specials: 1 },
      timeout: 15_000,
    });
    const locale = normalizeSourceLocale(show?.language);
    const episodeEvidence = new Map<number, RecapEvidence[]>();

    (Array.isArray(data) ? data : []).forEach((episode: any) => {
      if (Number(episode?.season) !== input.seasonNumber) return;
      const episodeNumber = toPositiveInteger(episode?.number);
      const summary = sanitizeText(episode?.summary);
      if (!episodeNumber || !summary) return;
      episodeEvidence.set(episodeNumber, [{
        id: `tvmaze-e${episodeNumber}-summary-${locale}`,
        providerId: 'tvmaze',
        kind: 'episode-synopsis',
        episodeNumber,
        locale,
        text: summary,
        sourceUrl: normalizeImageUrl(episode?.url),
        trustTier: 'reference',
      }]);
    });

    if (episodeEvidence.size === 0) return null;
    return {
      provider: {
        id: 'tvmaze',
        label: 'TVmaze',
        fetchedAt: input.fetchedAt,
        sourceUrl: normalizeImageUrl(show?.url),
        termsUrl: 'https://www.tvmaze.com/api#licensing',
      },
      seasonEvidence: [],
      episodeEvidence,
    };
  } catch (error) {
    console.warn('TVmaze recap enrichment is unavailable; continuing with other sources.', toErrorMessage(error));
    return null;
  }
}

function deduplicateEvidence(items: RecapEvidence[]): RecapEvidence[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = item.text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((first, second) => evidencePriority(second) - evidencePriority(first))
    .slice(0, 4);
}

function evidencePriority(evidence: RecapEvidence): number {
  const trustScore = {
    official: 400,
    'licensed-transcript': 350,
    editorial: 300,
    reference: 200,
  }[evidence.trustTier];
  const localeScore = evidence.locale === RECAP_LOCALE ? 80 : evidence.locale === 'en' ? 40 : 0;
  return trustScore + localeScore + Math.min(evidence.text.length, 1_200) / 100;
}

function selectPrimaryOverview(evidence: RecapEvidence[]): string | null {
  return evidence.find(item => item.kind === 'episode-synopsis')?.text || null;
}

function normalizeSourceLocale(language: unknown): string {
  const value = sanitizeText(language).toLocaleLowerCase();
  if (value === 'french' || value === 'français' || value === 'fr') return 'fr';
  if (value === 'english' || value === 'anglais' || value === 'en') return 'en';
  return value.slice(0, 12) || 'und';
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function looksLikeTmdbReadAccessToken(value: string | undefined): boolean {
  if (!value) return false;
  return value.length > 100 || value.split('.').length === 3;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createRecapPrompt(
  snapshot: RecapSourceSnapshot,
  promptTemplate?: string,
): string {
  const targetBeatCount = getTargetBeatCount(snapshot.episodes.length);
  const seasonQuickFacts = [
    `- Série : ${snapshot.show.name}`,
    `- Saison : ${snapshot.season.number}`,
    `- Nombre d'épisodes : ${snapshot.episodes.length}`,
    `- Genres : ${snapshot.show.genres.join(', ') || 'indisponibles'}`,
    `- Première diffusion : ${snapshot.season.firstAired || 'inconnue'}`,
    `- Sources disponibles : ${snapshot.providers.map(provider => provider.label).join(', ')}`,
    snapshot.show.overview ? `- Présentation de la série : ${clampText(snapshot.show.overview, 600)}` : null,
    ...snapshot.season.evidence.map(evidence => (
      `- [${evidence.id}] Synopsis de saison (${evidence.providerId}, ${evidence.locale}) : ${clampText(evidence.text, 1_600)}`
    )),
  ].filter(Boolean).join('\n');

  const episodeDetailedList = snapshot.episodes.map((episode) => {
    const evidenceLines = episode.evidence.length
      ? episode.evidence.map(evidence => (
        `- [${evidence.id}] ${evidence.providerId}/${evidence.locale}/${evidence.trustTier} : ${clampText(evidence.text, 1_600)}`
      ))
      : ['- Aucun fragment narratif suffisamment détaillé n’est disponible.'];
    return [
      `[E${episode.number}] ${episode.title}`,
      'Fragments de preuve :',
      ...evidenceLines,
      `Image disponible : ${episode.image ? 'oui' : 'non'}`,
    ].join('\n');
  }).join('\n\n');

  const seasonSummary = snapshot.season.evidence.map(evidence => evidence.text).join('\n')
    || snapshot.show.overview
    || 'Résumé de saison indisponible.';

  return (promptTemplate || defaultRecapPromptTemplate)
    .replace(/{{seasonQuickFacts}}/g, seasonQuickFacts)
    .replace(/{{toneGuidance}}/g, deriveToneGuidance(snapshot.show.genres))
    .replace(/{{seasonSummary}}/g, seasonSummary)
    .replace(/{{episodeDetailedList}}/g, episodeDetailedList)
    .replace(/{{episodeCount}}/g, String(snapshot.episodes.length))
    .replace(/{{targetBeatCount}}/g, String(targetBeatCount));
}

export async function startRecapGeneration(input: {
  prompt: string;
  model: string;
  jobId: string;
}): Promise<{ id: string; status: string }> {
  const client = createOpenAIClient();
  const response = await client.responses.create({
    model: input.model,
    background: true,
    instructions: [
      'Tu produis un recap factuel en français à partir des seules sources fournies.',
      'Ne complète jamais une information absente avec ta mémoire.',
      'Chaque moment doit citer les identifiants exacts des fragments qui prouvent sa narration.',
      'Le recap peut révéler toute la saison demandée mais jamais les saisons suivantes.',
    ].join(' '),
    input: input.prompt,
    max_output_tokens: 6_000,
    metadata: {
      feature: 'synupsis_recap',
      generation_job_id: input.jobId,
      prompt_version: RECAP_PROMPT_VERSION,
    },
    text: {
      format: {
        type: 'json_schema',
        name: 'synupsis_recap_story',
        description: 'A source-grounded season recap split into a cover and chronological story beats.',
        strict: true,
        schema: recapStoryJsonSchema,
      },
    },
  });

  return { id: response.id, status: response.status ?? 'queued' };
}

export async function retrieveRecapGeneration(responseId: string) {
  return createOpenAIClient().responses.retrieve(responseId);
}

export function processRecapResponse(
  responseText: string,
  snapshot: RecapSourceSnapshot,
): {
  story: RecapStory;
  quality: RecapQualityReport;
  slides: GeneratedSlide[];
} {
  if (!responseText) {
    throw new Error('OpenAI returned an empty response.');
  }

  const raw = JSON.parse(responseText);
  const story = normalizeRecapStory(raw, snapshot);
  const quality = evaluateRecapStory(story, snapshot);
  const slides = buildRecapSlides(story, snapshot);
  return { story, quality, slides };
}

export function normalizeRecapStory(raw: any, snapshot: RecapSourceSnapshot): RecapStory {
  const beats = (Array.isArray(raw?.beats) ? raw.beats : [])
    .map((beat: any): RecapStoryBeat | null => {
      const episodeNumbers = Array.from(new Set(
        (Array.isArray(beat?.episodeNumbers) ? beat.episodeNumbers : [])
          .map(Number)
          .filter((value: number) => Number.isInteger(value) && value > 0),
      )) as number[];
      const requestedImageEpisode = Number(beat?.imageEpisodeNumber);
      const imageEpisodeNumber = Number.isInteger(requestedImageEpisode) && requestedImageEpisode > 0
        ? requestedImageEpisode
        : episodeNumbers[0];
      const evidenceIds = Array.from(new Set(
        (Array.isArray(beat?.evidenceIds) ? beat.evidenceIds : [])
          .map((value: unknown) => sanitizeText(value))
          .filter(Boolean),
      )).slice(0, 12) as string[];

      if (!episodeNumbers.length || !imageEpisodeNumber) return null;

      return {
        headline: clampText(sanitizeText(beat.headline), 64),
        narration: clampText(sanitizeText(beat.narration), 360),
        tag: clampText(sanitizeText(beat.tag), 22),
        episodeNumbers,
        imageEpisodeNumber,
        evidenceIds,
      };
    })
    .filter((beat: RecapStoryBeat | null): beat is RecapStoryBeat => Boolean(
      beat?.headline && beat.narration,
    ))
    .slice(0, 12);

  if (beats.length < 3) {
    throw new Error('The generated story does not contain enough valid story beats.');
  }

  return {
    locale: RECAP_LOCALE,
    spoilerScope: 'through-season',
    cover: {
      title: clampText(sanitizeText(raw?.cover?.title) || snapshot.show.name, 64),
      subtitle: clampText(
        sanitizeText(raw?.cover?.subtitle) || `Saison ${snapshot.season.number}`,
        96,
      ),
      logline: clampText(
        sanitizeText(raw?.cover?.logline) || 'Les moments essentiels de cette saison.',
        200,
      ),
    },
    beats,
  };
}

export function evaluateRecapStory(
  story: RecapStory,
  snapshot: RecapSourceSnapshot,
): RecapQualityReport {
  const issues: string[] = [];
  const allEpisodeNumbers = new Set(snapshot.episodes.map((episode) => episode.number));
  const episodeEvidence = snapshot.episodes.flatMap(episode => episode.evidence);
  const evidenceById = new Map(episodeEvidence.map(evidence => [evidence.id, evidence]));
  const referencedEpisodeNumbers = new Set(
    story.beats.flatMap(beat => beat.episodeNumbers).filter(number => allEpisodeNumbers.has(number)),
  );
  const referenceCount = story.beats.reduce(
    (count, beat) => count + beat.episodeNumbers.length + 1 + beat.evidenceIds.length,
    0,
  );
  const validReferenceCount = story.beats.reduce((count, beat) => {
    const validEpisodes = beat.episodeNumbers.filter(number => allEpisodeNumbers.has(number)).length;
    const validImage = allEpisodeNumbers.has(beat.imageEpisodeNumber)
      && beat.episodeNumbers.includes(beat.imageEpisodeNumber);
    const validEvidence = beat.evidenceIds.filter((id) => {
      const evidence = evidenceById.get(id);
      return evidence?.episodeNumber != null && beat.episodeNumbers.includes(evidence.episodeNumber);
    }).length;
    return count + validEpisodes + (validImage ? 1 : 0) + validEvidence;
  }, 0);
  const beatsWithEvidence = story.beats.filter(beat => beat.evidenceIds.some((id) => {
    const evidence = evidenceById.get(id);
    return evidence?.episodeNumber != null && beat.episodeNumbers.includes(evidence.episodeNumber);
  })).length;
  const episodesWithSources = snapshot.episodes.filter(episode => episode.evidence.length > 0).length;
  const richnessTotal = snapshot.episodes.reduce((total, episode) => {
    const uniqueTextLength = deduplicateEvidence(episode.evidence)
      .reduce((length, evidence) => length + evidence.text.length, 0);
    return total + Math.min(1, uniqueTextLength / 240);
  }, 0);
  const providerIds = new Set(episodeEvidence.map(evidence => evidence.providerId));

  const sourceCoverage = ratio(episodesWithSources, snapshot.episodes.length);
  const episodeCoverage = ratio(referencedEpisodeNumbers.size, snapshot.episodes.length);
  const referenceValidity = ratio(validReferenceCount, referenceCount);
  const evidenceCoverage = ratio(beatsWithEvidence, story.beats.length);
  const sourceRichness = ratio(richnessTotal, snapshot.episodes.length);
  const targetBeatCount = getTargetBeatCount(snapshot.episodes.length);
  const beatCountScore = Math.min(1, story.beats.length / Math.max(targetBeatCount - 1, 1));

  if (sourceCoverage < 0.5) issues.push('insufficient_source_coverage');
  if (sourceRichness < 0.2) issues.push('thin_source_material');
  if (episodeCoverage < 0.45) issues.push('low_episode_coverage');
  if (referenceValidity < 1) issues.push('invalid_story_references');
  if (evidenceCoverage < 1) issues.push('uncited_story_beats');
  if (story.beats.length < Math.max(3, targetBeatCount - 2)) issues.push('too_few_story_beats');

  const score = roundScore(
    sourceCoverage * 0.2
      + sourceRichness * 0.15
      + episodeCoverage * 0.15
      + referenceValidity * 0.25
      + evidenceCoverage * 0.15
      + beatCountScore * 0.1,
  );

  return {
    score,
    publishable: issues.length === 0 && score >= 0.68,
    sourceCoverage: roundScore(sourceCoverage),
    episodeCoverage: roundScore(episodeCoverage),
    referenceValidity: roundScore(referenceValidity),
    evidenceCoverage: roundScore(evidenceCoverage),
    sourceRichness: roundScore(sourceRichness),
    sourceDiversity: providerIds.size,
    issues,
  };
}

export function buildRecapSlides(
  story: RecapStory,
  snapshot: RecapSourceSnapshot,
): GeneratedSlide[] {
  const palette = determinePalette(snapshot.show.genres);
  const coverImage = snapshot.season.image
    || snapshot.show.image
    || snapshot.episodes.find((episode) => episode.image)?.image
    || null;

  const slides: GeneratedSlide[] = [{
    order: 1,
    canvas: createCoverCanvas(story, palette, coverImage, snapshot),
  }];

  story.beats.forEach((beat, index) => {
    const episode = snapshot.episodes.find((item) => item.number === beat.imageEpisodeNumber)
      || snapshot.episodes.find((item) => beat.episodeNumbers.includes(item.number));
    slides.push({
      order: index + 2,
      canvas: createBeatCanvas({
        order: index + 2,
        beat,
        episode,
        palette,
        backgroundImage: episode?.image || coverImage,
        alignRight: index % 2 === 1,
      }),
    });
  });

  return slides;
}

function createCoverCanvas(
  story: RecapStory,
  palette: Palette,
  coverImage: string | null,
  snapshot: RecapSourceSnapshot,
) {
  const children: Record<string, unknown>[] = createBackgroundNodes(coverImage, palette, 1);
  let currentY = 112;
  const titleFontSize = story.cover.title.length > 45 ? 36 : story.cover.title.length > 30 ? 40 : 44;
  const subtitleFontSize = story.cover.subtitle.length > 70 ? 23 : story.cover.subtitle.length > 45 ? 25 : 27;
  const loglineFontSize = story.cover.logline.length > 150 ? 18 : story.cover.logline.length > 100 ? 19 : 21;

  const title = createTextGroup({
    id: 'group-slide-1-title',
    text: story.cover.title || snapshot.show.name,
    y: currentY,
    fontSize: titleFontSize,
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
  });
  children.push(title.node);
  currentY += title.totalHeight + 28;

  const subtitle = createTextGroup({
    id: 'group-slide-1-subtitle',
    text: story.cover.subtitle,
    y: currentY,
    fontSize: subtitleFontSize,
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
  });
  children.push(subtitle.node);
  currentY += subtitle.totalHeight + 24;

  const logline = createTextGroup({
    id: 'group-slide-1-logline',
    text: story.cover.logline,
    y: currentY,
    fontSize: loglineFontSize,
    lineHeight: 1.3,
    fontFamily: BODY_FONT_FAMILY,
    textColor: palette.bodyText,
    backgroundFill: palette.bodyBackground,
    paddingX: 24,
    paddingY: 20,
    maxWidth: 320,
    align: 'center',
    centerHorizontally: true,
    cornerRadius: 20,
  });
  children.push(logline.node);

  return createStage(children, 6_500);
}

function createBeatCanvas(input: {
  order: number;
  beat: RecapStoryBeat;
  episode?: EpisodeSource;
  palette: Palette;
  backgroundImage: string | null;
  alignRight: boolean;
}) {
  const children: Record<string, unknown>[] = createBackgroundNodes(
    input.backgroundImage,
    input.palette,
    input.order,
  );
  const panelX = input.alignRight ? 36 : 24;
  let currentY = 112;
  const episodeLabel = formatEpisodeReferences(input.beat.episodeNumbers);

  const badge = createPillGroup({
    id: `group-slide-${input.order}-badge`,
    text: episodeLabel,
    y: currentY,
    palette: input.palette,
    alignRight: input.alignRight,
  });
  children.push(badge.node);
  currentY += badge.totalHeight + 22;

  const headline = createTextGroup({
    id: `group-slide-${input.order}-headline`,
    text: input.beat.headline,
    x: panelX,
    y: currentY,
    fontSize: 34,
    lineHeight: 1.14,
    fontFamily: TITLE_FONT_FAMILY,
    textColor: input.palette.titleText,
    backgroundFill: input.palette.titleBackground,
    paddingX: 24,
    paddingY: 20,
    maxWidth: 306,
    align: input.alignRight ? 'right' : 'left',
    cornerRadius: 22,
  });
  children.push(headline.node);
  currentY += headline.totalHeight + 20;

  const summaryFontSize = input.beat.narration.length > 320
    ? 17
    : input.beat.narration.length > 260
      ? 18
      : input.beat.narration.length > 200
        ? 19
        : input.beat.narration.length > 160
          ? 20
          : 22;
  const narration = createTextGroup({
    id: `group-slide-${input.order}-summary`,
    text: input.beat.narration,
    x: panelX,
    y: currentY,
    fontSize: summaryFontSize,
    lineHeight: 1.32,
    fontFamily: BODY_FONT_FAMILY,
    textColor: input.palette.bodyText,
    backgroundFill: input.palette.bodyBackground,
    paddingX: 24,
    paddingY: 20,
    maxWidth: 306,
    align: input.alignRight ? 'right' : 'left',
    cornerRadius: 20,
  });
  children.push(narration.node);

  if (input.beat.tag) {
    const tag = createPillGroup({
      id: `group-slide-${input.order}-tag`,
      text: input.beat.tag,
      y: Math.min(currentY + narration.totalHeight + 18, 780),
      palette: input.palette,
      alignRight: !input.alignRight,
    });
    children.push(tag.node);
  }

  const wordCount = input.beat.narration.split(/\s+/).filter(Boolean).length;
  const durationMs = Math.min(12_000, Math.max(5_500, Math.round((wordCount / 3.2 + 2) * 1_000)));
  return createStage(children, durationMs);
}

function createStage(children: Record<string, unknown>[], durationMs: number) {
  return {
    className: 'Stage',
    attrs: {
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      scaleX: 1,
      scaleY: 1,
      durationMs,
      formatVersion: RECAP_FORMAT_VERSION,
    },
    children: [{ className: 'Layer', children }],
  };
}

function createBackgroundNodes(imageSrc: string | null, palette: Palette, order: number) {
  const nodes: Record<string, unknown>[] = [{
    className: 'Rect',
    attrs: {
      id: `background-gradient-slide-${order}`,
      x: 0,
      y: 0,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      fillLinearGradientStartPoint: { x: 0, y: 0 },
      fillLinearGradientEndPoint: { x: 0, y: STAGE_HEIGHT },
      fillLinearGradientColorStops: [0, palette.gradient[0], 1, palette.gradient[1]],
      listening: false,
    },
  }];
  if (imageSrc) {
    nodes.push({
      className: 'Image',
      attrs: {
        id: `background-slide-${order}`,
        name: `background-slide-${order}`,
        x: 0,
        y: 0,
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        src: getProxiedImageUrl(imageSrc),
        fit: 'cover',
        focalX: 0.5,
        focalY: 0.45,
        listening: false,
      },
    });
  }

  nodes.push({
    className: 'Rect',
    attrs: {
      id: `background-overlay-slide-${order}`,
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

function createTextGroup(options: TextGroupOptions): TextGroupResult {
  const paddingX = options.paddingX ?? 20;
  const paddingY = options.paddingY ?? 16;
  const metrics = estimateTextMetrics(options.text, options.fontSize, options.lineHeight, options.maxWidth);
  const rectWidth = metrics.width + paddingX * 2;
  const rectHeight = metrics.height + paddingY * 2;
  const x = options.centerHorizontally
    ? Math.max((STAGE_WIDTH - rectWidth) / 2, 24)
    : (options.x ?? 24);

  return {
    totalHeight: rectHeight,
    width: rectWidth,
    node: {
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
            text: options.text,
            fontSize: options.fontSize,
            lineHeight: options.lineHeight,
            fontFamily: options.fontFamily,
            fill: options.textColor,
            wrap: 'word',
            align: options.align ?? 'left',
          },
        },
      ],
    },
  };
}

function createPillGroup(input: {
  id: string;
  text: string;
  y: number;
  palette: Palette;
  alignRight: boolean;
}): TextGroupResult {
  const fontSize = 17;
  const paddingX = 15;
  const paddingY = 9;
  const metrics = estimateTextMetrics(input.text, fontSize, 1.05, 210);
  const rectWidth = metrics.width + paddingX * 2;
  const rectHeight = metrics.height + paddingY * 2;
  const x = input.alignRight ? STAGE_WIDTH - rectWidth - 24 : 24;

  return {
    totalHeight: rectHeight,
    width: rectWidth,
    node: {
      className: 'Group',
      attrs: { id: input.id, name: input.id, x, y: input.y, draggable: true },
      children: [
        {
          className: 'Rect',
          attrs: {
            width: rectWidth,
            height: rectHeight,
            fill: input.alignRight ? input.palette.tagBackground : input.palette.badgeBackground,
            cornerRadius: rectHeight / 2,
          },
        },
        {
          className: 'Text',
          attrs: {
            x: paddingX,
            y: paddingY,
            width: metrics.width,
            text: input.text,
            fontSize,
            fontFamily: BODY_FONT_FAMILY,
            lineHeight: 1.05,
            fill: input.alignRight ? input.palette.tagText : input.palette.badgeText,
            align: 'center',
          },
        },
      ],
    },
  };
}

function estimateTextMetrics(text: string, fontSize: number, lineHeight: number, maxWidth: number) {
  const averageCharWidth = fontSize * 0.53;
  const maxCharsPerLine = Math.max(6, Math.floor(maxWidth / averageCharWidth));
  const words = (text || '').split(/\s+/).filter(Boolean);
  let lineCount = 1;
  let currentLineLength = 0;
  let longestLineLength = 0;

  words.forEach((word) => {
    const nextLength = currentLineLength ? currentLineLength + word.length + 1 : word.length;
    if (nextLength > maxCharsPerLine && currentLineLength > 0) {
      longestLineLength = Math.max(longestLineLength, currentLineLength);
      currentLineLength = word.length;
      lineCount += 1;
    } else {
      currentLineLength = nextLength;
    }
  });
  longestLineLength = Math.max(longestLineLength, currentLineLength);

  return {
    width: Math.min(maxWidth, Math.max(longestLineLength * averageCharWidth, fontSize * 2)),
    height: lineCount * fontSize * lineHeight,
  };
}

function determinePalette(genres: string[]): Palette {
  const lower = genres.map((genre) => genre.toLowerCase());
  if (lower.includes('comedy')) {
    return {
      gradient: ['#f59e0b', '#7c2d12'], overlay: 'rgba(69, 26, 3, 0.46)',
      titleBackground: 'rgba(255, 255, 255, 0.91)', bodyBackground: 'rgba(255, 255, 255, 0.87)',
      titleText: '#0f172a', bodyText: '#1f2937', badgeBackground: '#38bdf8', badgeText: '#082f49',
      tagBackground: '#fb923c', tagText: '#1c1917',
    };
  }
  if (lower.includes('science-fiction') || lower.includes('sci-fi')) {
    return {
      gradient: ['#312e81', '#020617'], overlay: 'rgba(2, 6, 23, 0.58)',
      titleBackground: 'rgba(30, 41, 59, 0.88)', bodyBackground: 'rgba(15, 23, 42, 0.84)',
      titleText: '#e0f2fe', bodyText: '#dbeafe', badgeBackground: '#5eead4', badgeText: '#022c22',
      tagBackground: '#818cf8', tagText: '#111827',
    };
  }
  if (lower.includes('fantasy')) {
    return {
      gradient: ['#4c1d95', '#1e1b4b'], overlay: 'rgba(30, 27, 75, 0.55)',
      titleBackground: 'rgba(76, 29, 149, 0.88)', bodyBackground: 'rgba(46, 16, 101, 0.84)',
      titleText: '#f5f3ff', bodyText: '#ede9fe', badgeBackground: '#f472b6', badgeText: '#4a044e',
      tagBackground: '#c084fc', tagText: '#3b0764',
    };
  }
  if (lower.includes('thriller') || lower.includes('crime')) {
    return {
      gradient: ['#1f2937', '#020617'], overlay: 'rgba(2, 6, 23, 0.64)',
      titleBackground: 'rgba(15, 23, 42, 0.92)', bodyBackground: 'rgba(15, 23, 42, 0.86)',
      titleText: '#f8fafc', bodyText: '#e2e8f0', badgeBackground: '#f87171', badgeText: '#450a0a',
      tagBackground: '#f8fafc', tagText: '#0f172a',
    };
  }
  return {
    gradient: ['#0f172a', '#020617'], overlay: 'rgba(2, 6, 23, 0.58)',
    titleBackground: 'rgba(15, 23, 42, 0.9)', bodyBackground: 'rgba(15, 23, 42, 0.84)',
    titleText: '#f9fafb', bodyText: '#e5e7eb', badgeBackground: '#60a5fa', badgeText: '#0b1120',
    tagBackground: '#facc15', tagText: '#111827',
  };
}

function deriveToneGuidance(genres: string[]): string {
  const lower = genres.map((genre) => genre.toLowerCase());
  if (lower.includes('comedy')) return 'Ton vif et chaleureux, sans inventer de gag.';
  if (lower.includes('thriller') || lower.includes('crime')) return 'Ton tendu et précis, centré sur les causes et conséquences.';
  if (lower.includes('science-fiction') || lower.includes('sci-fi')) return 'Ton cinématographique et clair, sans jargon ajouté.';
  if (lower.includes('fantasy')) return 'Ton évocateur mais factuel, avec une chronologie explicite.';
  return 'Ton cinématographique, clair et factuel.';
}

function extractTraktEpisodeImage(images: any): string | null {
  const screenshot = images?.screenshot;
  const candidate = Array.isArray(screenshot)
    ? screenshot[0]
    : screenshot?.full || screenshot?.medium || screenshot?.thumb;
  return normalizeImageUrl(candidate);
}

function normalizeImageUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getProxiedImageUrl(url: string): string {
  return `/api/image-proxy/?url=${encodeURIComponent(url)}`;
}

function sanitizeText(text?: unknown): string {
  if (typeof text !== 'string') return '';
  return text.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
}

function clampText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text.trim();
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function formatEpisodeReferences(episodeNumbers: number[]): string {
  if (episodeNumbers.length === 1) return `Épisode ${episodeNumbers[0]}`;
  return `Épisodes ${episodeNumbers.join(' · ')}`;
}

function getTargetBeatCount(episodeCount: number): number {
  return Math.min(10, Math.max(5, Math.ceil(episodeCount / 2)));
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}
