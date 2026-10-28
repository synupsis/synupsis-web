import { MIN_DOCUMENTED_EPISODE_CHARS, MIN_DOCUMENTED_EPISODE_RATIO } from '~/server/services/recap-generation/config';
import { createOpenAIClient, getRecapModel } from '~/server/services/recap-generation/openai';
import type {
  EpisodeSource,
  RecapCharacterPortrait,
  RecapEvidence,
  RecapImageFocus,
  RecapSourceProvider,
  RecapSourceReadiness,
  RecapSourceSnapshot,
} from '~/server/services/recap-generation/types';
import {
  evidencePriority,
  getEpisodeEventRange,
  measureEpisodeSourceLength,
  normalizeCharacterKey,
  ratio,
  roundScore,
  sanitizeText,
  toPositiveInteger,
} from '~/server/services/recap-generation/utils';
import {
  createRecapSourceProvider,
  evaluateRecapSourceRights,
  getRecapSourcePolicy,
  type RecapSourceProviderId,
} from '~/server/services/recap-source-registry';
import { fetchWikimediaRecapEnrichment } from '~/server/services/wikimedia-recap-source';
import { createTraktHeaders } from '~/server/utils/trakt';

const TARGET_EPISODE_SOURCE_CHARS = 1_200;
const MAX_EVIDENCE_PER_EPISODE = 4;

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
  const headers = createTraktHeaders(clientId);
  const seasonUrl = `https://api.trakt.tv/shows/${input.showTraktId}/seasons/${input.seasonNumber}?extended=full`;
  const showUrl = `https://api.trakt.tv/shows/${input.showTraktId}?extended=full`;
  const [seasonResponse, showResponse] = await Promise.all([
    $fetch<any>(seasonUrl, { headers, timeout: 15_000 }),
    $fetch<any>(showUrl, { headers, timeout: 15_000 }),
  ]);
  const traktEpisodes = Array.isArray(seasonResponse) ? seasonResponse : [];
  const traktShow = showResponse || {};

  if (traktEpisodes.length === 0) {
    throw new Error('Trakt returned no episodes for this season.');
  }

  const tmdbId = toPositiveInteger(traktShow?.ids?.tmdb);
  const tvdbId = toPositiveInteger(traktShow?.ids?.tvdb);
  const imdbId = sanitizeText(traktShow?.ids?.imdb) || null;
  const traktSlug = sanitizeText(traktShow?.ids?.slug);
  const traktPolicy = getRecapSourcePolicy('trakt');
  const providers: RecapSourceProvider[] = [createRecapSourceProvider(
    'trakt',
    fetchedAt,
    traktSlug ? `https://trakt.tv/shows/${traktSlug}` : null,
  )];

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
          licenseId: traktPolicy.licenseId,
          retrievedAt: fetchedAt,
          revisionId: null,
        }] : [],
      };
    })
    .sort((first: EpisodeSource, second: EpisodeSource) => first.number - second.number);

  if (episodes.length === 0) {
    throw new Error('Trakt returned no regular episodes for this season.');
  }

  const [enrichmentResults, tmdbImages] = await Promise.all([
    Promise.all([
      fetchTmdbEvidence({ tmdbId, seasonNumber: input.seasonNumber, fetchedAt }),
      fetchTvMazeEvidence({ tvdbId, imdbId, seasonNumber: input.seasonNumber, fetchedAt }),
      fetchWikimediaRecapEnrichment({
        showName: input.showName,
        imdbId,
        seasonNumber: input.seasonNumber,
        fetchedAt,
      }),
    ]),
    fetchTmdbImages({ tmdbId, seasonNumber: input.seasonNumber, episodeNumbers: episodes.map(episode => episode.number) }),
  ]);
  episodes.forEach((episode) => {
    const stills = tmdbImages?.stills.get(episode.number);
    if (stills?.length) episode.stills = stills;
  });
  const characterPortraits = enrichmentResults.flatMap(enrichment => (enrichment && 'portraits' in enrichment ? enrichment.portraits ?? [] : []));
  const imageFocus = await locateImageFocus([
    ...episodes.flatMap(episode => episode.stills ?? []),
    ...(tmdbImages?.backdrops ?? []),
  ]);
  const seasonEvidence: RecapEvidence[] = [];
  let wikidataId: string | null = null;

  enrichmentResults.filter(Boolean).forEach((enrichment) => {
    if (!enrichment) return;
    providers.push(...enrichment.providers);
    seasonEvidence.push(...enrichment.seasonEvidence);
    if ('wikidataId' in enrichment && enrichment.wikidataId) {
      wikidataId = enrichment.wikidataId;
    }
    enrichment.episodeEvidence.forEach((items, episodeNumber) => {
      const episode = episodes.find(candidate => candidate.number === episodeNumber);
      if (!episode) return;
      episode.evidence = deduplicateEvidence([...episode.evidence, ...items]);
      episode.overview = selectPrimaryOverview(episode.evidence) || episode.overview;
    });
  });

  const uniqueProviders = deduplicateProviders(providers);
  return {
    provider: 'multi-source',
    fetchedAt,
    providers: uniqueProviders,
    rights: evaluateRecapSourceRights(uniqueProviders),
    show: {
      id: input.showId,
      traktId: input.showTraktId,
      tmdbId,
      tvdbId,
      imdbId,
      wikidataId,
      name: input.showName,
      genres: input.showGenres ?? [],
      overview: sanitizeText(input.showOverview) || null,
      image: normalizeImageUrl(input.showImage),
      backdrops: tmdbImages?.backdrops ?? [],
    },
    season: {
      id: input.seasonId,
      number: input.seasonNumber,
      firstAired: input.seasonFirstAired,
      image: normalizeImageUrl(input.seasonImage),
      evidence: deduplicateEvidence(seasonEvidence),
    },
    episodes,
    characterPortraits,
    imageFocus,
  };
}

type SourceEnrichment = {
  providers: RecapSourceProvider[];
  seasonEvidence: RecapEvidence[];
  episodeEvidence: Map<number, RecapEvidence[]>;
  portraits?: RecapCharacterPortrait[];
};

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w1280';
const MAX_STILLS_PER_EPISODE = 12;
const MAX_BACKDROPS = 40;

function createTmdbRequestConfig() {
  const configuredAccessToken = process.env.TMDB_API_READ_ACCESS_TOKEN;
  const configuredApiKey = process.env.TMDB_API_KEY;
  const accessToken = configuredAccessToken
    || (looksLikeTmdbReadAccessToken(configuredApiKey) ? configuredApiKey : undefined);
  const apiKey = accessToken ? undefined : configuredApiKey;
  if (!accessToken && !apiKey) return null;
  return {
    timeout: 15_000,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    query: apiKey ? { api_key: apiKey } : undefined,
  };
}

export type RecapCoverArt = {
  posterUrl: string | null;
  logoUrl: string | null;
};

/**
 * The cover's art: a season poster without text (else the show's, else any
 * season poster) and the show's title logo, French first, then English.
 */
export async function fetchTmdbCoverArt(input: { tmdbId: number | null; seasonNumber: number }): Promise<RecapCoverArt | null> {
  const requestConfig = createTmdbRequestConfig();
  if (!input.tmdbId || !requestConfig) return null;
  const imageConfig = {
    ...requestConfig,
    query: { ...requestConfig.query, include_image_language: 'fr,en,null' },
  };
  const byVotes = (first: any, second: any) => (Number(second.vote_average) || 0) - (Number(first.vote_average) || 0);
  const withPath = (images: unknown) => (Array.isArray(images) ? images : []).filter((image: any) => typeof image?.file_path === 'string');

  try {
    const [showImages, seasonImages] = await Promise.all([
      $fetch<any>(`https://api.themoviedb.org/3/tv/${input.tmdbId}/images`, imageConfig),
      $fetch<any>(`https://api.themoviedb.org/3/tv/${input.tmdbId}/season/${input.seasonNumber}/images`, imageConfig).catch(() => null),
    ]);
    const seasonPosters = withPath(seasonImages?.posters).sort(byVotes);
    const showPosters = withPath(showImages?.posters).sort(byVotes);
    const poster = seasonPosters.find((image: any) => !image.iso_639_1)
      ?? showPosters.find((image: any) => !image.iso_639_1)
      ?? seasonPosters[0]
      ?? showPosters[0];
    const languageRank = (image: any) => (image.iso_639_1 === 'fr' ? 0 : image.iso_639_1 === 'en' ? 1 : 2);
    const logo = withPath(showImages?.logos)
      .sort((first: any, second: any) => languageRank(first) - languageRank(second) || byVotes(first, second))[0];
    return {
      posterUrl: poster ? `https://image.tmdb.org/t/p/w780${poster.file_path}` : null,
      // SVG logos stay vectors; bitmaps come at a width that stays sharp on a phone.
      logoUrl: logo
        ? `https://image.tmdb.org/t/p/${String(logo.file_path).endsWith('.svg') ? 'original' : 'w500'}${logo.file_path}`
        : null,
    };
  } catch (error) {
    console.warn('TMDB cover art is unavailable; the cover keeps its image.', toErrorMessage(error));
    return null;
  }
}

/**
 * Several stills per episode and the show's backdrops, so the slides of a
 * chapter do not repeat one image. Text-free images come first.
 */
async function fetchTmdbImages(input: {
  tmdbId: number | null;
  seasonNumber: number;
  episodeNumbers: number[];
}): Promise<{ stills: Map<number, string[]>; backdrops: string[] } | null> {
  const requestConfig = createTmdbRequestConfig();
  if (!input.tmdbId || !requestConfig) return null;

  const toUrls = (images: unknown, limit: number) => (Array.isArray(images) ? images : [])
    .filter((image: any) => typeof image?.file_path === 'string')
    .sort((first: any, second: any) => Number(Boolean(first.iso_639_1)) - Number(Boolean(second.iso_639_1))
      || (Number(second.vote_average) || 0) - (Number(first.vote_average) || 0))
    .slice(0, limit)
    .map((image: any) => `${TMDB_IMAGE_BASE_URL}${image.file_path}`);

  try {
    const [showImages, ...episodeImages] = await Promise.all([
      $fetch<any>(`https://api.themoviedb.org/3/tv/${input.tmdbId}/images`, {
        ...requestConfig,
        query: { ...requestConfig.query, include_image_language: 'null,en' },
      }),
      ...input.episodeNumbers.map(episodeNumber => $fetch<any>(`https://api.themoviedb.org/3/tv/${input.tmdbId}/season/${input.seasonNumber}/episode/${episodeNumber}/images`, requestConfig)
        .catch(() => null)),
    ]);
    const stills = new Map<number, string[]>();
    input.episodeNumbers.forEach((episodeNumber, index) => {
      const urls = toUrls(episodeImages[index]?.stills, MAX_STILLS_PER_EPISODE);
      if (urls.length) stills.set(episodeNumber, urls);
    });
    return { stills, backdrops: toUrls(showImages?.backdrops, MAX_BACKDROPS) };
  } catch (error) {
    console.warn('TMDB images are unavailable; slides keep the episode images.', toErrorMessage(error));
    return null;
  }
}

async function fetchTmdbEvidence(input: {
  tmdbId: number | null;
  seasonNumber: number;
  fetchedAt: string;
}): Promise<SourceEnrichment | null> {
  const requestConfig = createTmdbRequestConfig();
  if (!input.tmdbId || !requestConfig) return null;

  const url = `https://api.themoviedb.org/3/tv/${input.tmdbId}/season/${input.seasonNumber}`;

  try {
    const [frenchResponse, englishResponse] = await Promise.all([
      $fetch<any>(url, { ...requestConfig, query: { ...requestConfig.query, language: 'fr-FR' } }),
      $fetch<any>(url, { ...requestConfig, query: { ...requestConfig.query, language: 'en-US' } }),
    ]);
    const episodeEvidence = new Map<number, RecapEvidence[]>();
    const seasonEvidence: RecapEvidence[] = [];
    const tmdbPolicy = getRecapSourcePolicy('tmdb');

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
          licenseId: tmdbPolicy.licenseId,
          retrievedAt: input.fetchedAt,
          revisionId: null,
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
          licenseId: tmdbPolicy.licenseId,
          retrievedAt: input.fetchedAt,
          revisionId: null,
        };
        episodeEvidence.set(episodeNumber, [...(episodeEvidence.get(episodeNumber) || []), evidence]);
      });
    };

    appendResponseEvidence(frenchResponse, 'fr');
    appendResponseEvidence(englishResponse, 'en');

    return {
      providers: [createRecapSourceProvider(
        'tmdb',
        input.fetchedAt,
        `https://www.themoviedb.org/tv/${input.tmdbId}/season/${input.seasonNumber}`,
      )],
      seasonEvidence: deduplicateEvidence(seasonEvidence),
      episodeEvidence,
    };
  } catch (error) {
    const message = (error as { statusCode?: number } | undefined)?.statusCode === 401
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
    const show = await $fetch<any>('https://api.tvmaze.com/lookup/shows', {
      query: lookupParams,
      timeout: 15_000,
    });
    const showId = toPositiveInteger(show?.id);
    if (!showId) return null;

    const data = await $fetch<any>(`https://api.tvmaze.com/shows/${showId}/episodes`, {
      query: { specials: 1 },
      timeout: 15_000,
    });
    const seasonEpisodeIds = (Array.isArray(data) ? data : [])
      .filter((episode: any) => Number(episode?.season) === input.seasonNumber)
      .flatMap((episode: any) => toPositiveInteger(episode?.id) ?? []);
    const portraits = await fetchTvMazePortraits(showId, seasonEpisodeIds);
    const locale = normalizeSourceLocale(show?.language);
    const episodeEvidence = new Map<number, RecapEvidence[]>();
    const tvmazePolicy = getRecapSourcePolicy('tvmaze');

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
        licenseId: tvmazePolicy.licenseId,
        retrievedAt: input.fetchedAt,
        revisionId: null,
      }]);
    });

    if (episodeEvidence.size === 0 && portraits.length === 0) return null;
    return {
      providers: [createRecapSourceProvider(
        'tvmaze',
        input.fetchedAt,
        normalizeImageUrl(show?.url),
      )],
      seasonEvidence: [],
      episodeEvidence,
      portraits,
    };
  } catch (error) {
    console.warn('TVmaze recap enrichment is unavailable; continuing with other sources.', toErrorMessage(error));
    return null;
  }
}

const IMAGE_FOCUS_BATCH_SIZE = 8;

const imageFocusJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['images'],
  properties: {
    images: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'x', 'y'],
        properties: {
          index: { type: 'integer' },
          x: { type: 'number' },
          y: { type: 'number' },
        },
      },
    },
  },
} as const;

/**
 * Asks a vision model, eight low-resolution images at a time, where the face of
 * each image's main person stands (or its main subject, without anyone), so a
 * tall or wide crop of a still keeps it in frame. It never identifies anyone.
 * A batch that fails leaves its images centered.
 */
async function locateImageFocus(urls: string[]): Promise<Record<string, RecapImageFocus>> {
  const candidates = [...new Set(urls)].filter(url => url.startsWith(TMDB_IMAGE_BASE_URL));
  if (!candidates.length || !process.env.OPENAI_API_KEY) return {};
  const client = createOpenAIClient();
  const model = getRecapModel();
  const batches = Array.from(
    { length: Math.ceil(candidates.length / IMAGE_FOCUS_BATCH_SIZE) },
    (_, index) => candidates.slice(index * IMAGE_FOCUS_BATCH_SIZE, (index + 1) * IMAGE_FOCUS_BATCH_SIZE),
  );
  const focus: Record<string, RecapImageFocus> = {};
  await Promise.all(batches.map(async (batch) => {
    try {
      const response = await client.responses.create({
        model,
        reasoning: { effort: 'low' },
        instructions: [
          'Pour chaque image numérotée, donne la position du visage de la personne principale : celle qui est au premier plan ou occupe le plus de place.',
          'x est la position horizontale en pourcentage de la largeur (0 = bord gauche, 100 = bord droit), y la position verticale en pourcentage de la hauteur (0 = haut).',
          'Sans personne visible, donne le centre du sujet principal. N’identifie jamais les personnes.',
        ].join(' '),
        input: [{
          role: 'user',
          content: batch.flatMap((url, index) => [
            { type: 'input_text' as const, text: `Image ${index + 1}` },
            { type: 'input_image' as const, image_url: url.replace(TMDB_IMAGE_BASE_URL, 'https://image.tmdb.org/t/p/w780'), detail: 'low' as const },
          ]),
        }],
        max_output_tokens: 4_000,
        text: { format: { type: 'json_schema', name: 'synupsis_image_focus', strict: true, schema: imageFocusJsonSchema } },
      }, { timeout: 90_000 });
      const raw = JSON.parse(response.output_text);
      (Array.isArray(raw?.images) ? raw.images : []).forEach((item: any) => {
        const url = batch[Number(item?.index) - 1];
        const x = Number(item?.x);
        const y = Number(item?.y);
        if (!url || !Number.isFinite(x) || !Number.isFinite(y)) return;
        focus[url] = { x: Math.round(Math.min(100, Math.max(0, x))), y: Math.round(Math.min(100, Math.max(0, y))) };
      });
    } catch (error) {
      console.warn('Image focus is unavailable for a batch; those crops stay centered.', toErrorMessage(error));
    }
  }));
  return focus;
}

/**
 * Portraits of the main cast and of the season's guests (the main cast only
 * lists the show's current regulars): the character's image, else its actor's.
 */
async function fetchTvMazePortraits(showId: number, episodeIds: number[]): Promise<RecapCharacterPortrait[]> {
  const toPortraits = (members: unknown) => (Array.isArray(members) ? members : []).flatMap((member: any) => {
    const name = sanitizeText(member?.character?.name);
    const imageUrl = normalizeImageUrl(member?.character?.image?.medium ?? member?.person?.image?.medium);
    return name && imageUrl ? [{ name, imageUrl }] : [];
  });
  try {
    const [cast, ...guestCasts] = await Promise.all([
      $fetch<any>(`https://api.tvmaze.com/shows/${showId}/cast`, { timeout: 15_000 }),
      ...episodeIds.map(episodeId => $fetch<any>(`https://api.tvmaze.com/episodes/${episodeId}/guestcast`, { timeout: 15_000 })
        .catch(() => null)),
    ]);
    const portraits = new Map<string, RecapCharacterPortrait>();
    [cast, ...guestCasts].flatMap(response => toPortraits(response)).forEach((portrait) => {
      const key = normalizeCharacterKey(portrait.name);
      if (!portraits.has(key)) portraits.set(key, portrait);
    });
    return [...portraits.values()];
  } catch (error) {
    console.warn('TVmaze portraits are unavailable; slides keep the initials.', toErrorMessage(error));
    return [];
  }
}

function deduplicateProviders(providers: RecapSourceProvider[]): RecapSourceProvider[] {
  const seen = new Set<RecapSourceProviderId>();
  return providers.filter((provider) => {
    if (seen.has(provider.id)) return false;
    seen.add(provider.id);
    return true;
  });
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
    .slice(0, MAX_EVIDENCE_PER_EPISODE);
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

function looksLikeTmdbReadAccessToken(value: string | undefined): boolean {
  if (!value) return false;
  return value.length > 100 || value.split('.').length === 3;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function evaluateRecapSourceReadiness(snapshot: RecapSourceSnapshot): RecapSourceReadiness {
  const lengths = snapshot.episodes.map(measureEpisodeSourceLength);
  const documentedEpisodes = lengths.filter(length => length >= MIN_DOCUMENTED_EPISODE_CHARS).length;
  const documentedRatio = ratio(documentedEpisodes, lengths.length);
  const richness = ratio(
    lengths.reduce((total, length) => total + Math.min(1, length / TARGET_EPISODE_SOURCE_CHARS), 0),
    lengths.length,
  );
  const issues = documentedRatio < MIN_DOCUMENTED_EPISODE_RATIO ? ['insufficient_episode_sources'] : [];

  return {
    ready: issues.length === 0,
    totalEpisodes: lengths.length,
    documentedEpisodes,
    documentedRatio: roundScore(documentedRatio),
    richness: roundScore(richness),
    issues,
  };
}

export function describeInsufficientSources(readiness: RecapSourceReadiness): string {
  const { documentedEpisodes, totalEpisodes } = readiness;
  const coverage = documentedEpisodes === 0
    ? 'aucun épisode n’est décrit précisément'
    : documentedEpisodes === 1
      ? `seul 1 épisode sur ${totalEpisodes} est décrit précisément`
      : `seuls ${documentedEpisodes} épisodes sur ${totalEpisodes} sont décrits précisément`;
  return `Pas assez de résumés détaillés pour cette saison : ${coverage} par les sources disponibles. Le récap n’a pas été généré pour éviter un résumé vague.`;
}

/** Episodes worth an extraction call: every episode with at least one source. */
export function getExtractableEpisodes(snapshot: RecapSourceSnapshot): EpisodeSource[] {
  return snapshot.episodes.filter(episode => getEpisodeEventRange(episode).max > 0);
}

export function getEpisodeExtractionTokenBudget(episode: EpisodeSource): number {
  // Reasoning tokens share this budget with the JSON output.
  return 8_000 + getEpisodeEventRange(episode).max * 700;
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
