import axios from 'axios';
import type { RecapEvidence, RecapSourceProvider } from '~/server/services/recap-generation';
import { createRecapSourceProvider, getRecapSourcePolicy } from '~/server/services/recap-source-registry';

type WikidataIdentity = {
  id: string;
  labels: string[];
};

type WikipediaArticle = {
  locale: 'fr' | 'en';
  title: string;
  text: string;
  sourceUrl: string;
  revisionId: string | null;
};

const TELEVISION_INSTANCE_IDS = new Set([
  'Q15416', // television program
  'Q581714', // animated series
  'Q1259759', // miniseries
  'Q5398426', // television series
]);

export type WikimediaRecapEnrichment = {
  providers: RecapSourceProvider[];
  seasonEvidence: RecapEvidence[];
  episodeEvidence: Map<number, RecapEvidence[]>;
  wikidataId: string | null;
};

const REQUEST_HEADERS = {
  'User-Agent': 'Synupsis/1.0 (recap evidence ingestion; contact through the Synupsis application)',
};

export async function fetchWikimediaRecapEnrichment(input: {
  showName: string;
  imdbId: string | null;
  seasonNumber: number;
  fetchedAt: string;
}): Promise<WikimediaRecapEnrichment | null> {
  if (process.env.RECAP_WIKIMEDIA_ENABLED === 'false') return null;

  try {
    const identity = await fetchWikidataIdentity(input.showName, input.imdbId);
    const labels = uniqueStrings([input.showName, ...(identity?.labels || [])]);
    const articles = (await Promise.all([
      fetchWikipediaSeasonArticle('fr', labels, input.seasonNumber),
      fetchWikipediaSeasonArticle('en', labels, input.seasonNumber),
    ])).filter((article): article is WikipediaArticle => Boolean(article));

    if (!identity && articles.length === 0) return null;

    const providers: RecapSourceProvider[] = [];
    if (identity) {
      providers.push(createRecapSourceProvider(
        'wikidata',
        input.fetchedAt,
        `https://www.wikidata.org/wiki/${identity.id}`,
      ));
    }
    const firstArticle = articles[0];
    if (firstArticle) {
      providers.push(createRecapSourceProvider('wikipedia', input.fetchedAt, firstArticle.sourceUrl));
    }

    const wikipediaPolicy = getRecapSourcePolicy('wikipedia');
    return {
      providers,
      wikidataId: identity?.id || null,
      episodeEvidence: new Map(),
      seasonEvidence: articles.map(article => ({
        id: `wikipedia-s${input.seasonNumber}-${article.locale}-${article.revisionId || slugify(article.title)}`,
        providerId: 'wikipedia',
        kind: 'season-article',
        episodeNumber: null,
        locale: article.locale,
        text: article.text,
        sourceUrl: article.sourceUrl,
        trustTier: 'reference',
        licenseId: wikipediaPolicy.licenseId,
        retrievedAt: input.fetchedAt,
        revisionId: article.revisionId,
      })),
    };
  } catch (error) {
    console.warn('Wikimedia recap enrichment is unavailable; continuing with other sources.', toErrorMessage(error));
    return null;
  }
}

async function fetchWikidataIdentity(
  showName: string,
  imdbId: string | null,
): Promise<WikidataIdentity | null> {
  const searches = await Promise.all(['fr', 'en'].map(async language => {
    const { data } = await axios.get('https://www.wikidata.org/w/api.php', {
      headers: REQUEST_HEADERS,
      timeout: 12_000,
      params: {
        action: 'wbsearchentities',
        search: showName,
        language,
        uselang: language,
        type: 'item',
        limit: 8,
        format: 'json',
        origin: '*',
      },
    });
    return Array.isArray(data?.search) ? data.search : [];
  }));
  const candidateIds = uniqueStrings(searches.flat().map(candidate => candidate?.id)).slice(0, 12);
  if (!candidateIds.length) return null;

  const { data } = await axios.get('https://www.wikidata.org/w/api.php', {
    headers: REQUEST_HEADERS,
    timeout: 12_000,
    params: {
      action: 'wbgetentities',
      ids: candidateIds.join('|'),
      props: 'claims|labels',
      languages: 'fr|en',
      format: 'json',
      origin: '*',
    },
  });
  const entities = candidateIds
    .map(id => data?.entities?.[id])
    .filter(Boolean);
  const normalizedShowName = normalizeForComparison(showName);
  const exactImdbMatch = imdbId
    ? entities.find(entity => getClaimValues(entity, 'P345').includes(imdbId))
    : null;
  const exactLabelMatch = entities.find(entity => (
    getEntityIdClaimValues(entity, 'P31').some(id => TELEVISION_INSTANCE_IDS.has(id))
      && getEntityLabels(entity).some(label => normalizeForComparison(label) === normalizedShowName)
  ));
  const selected = exactImdbMatch || exactLabelMatch;
  if (!selected?.id) return null;

  return {
    id: String(selected.id),
    labels: getEntityLabels(selected),
  };
}

async function fetchWikipediaSeasonArticle(
  locale: 'fr' | 'en',
  labels: string[],
  seasonNumber: number,
): Promise<WikipediaArticle | null> {
  const host = `${locale}.wikipedia.org`;
  const seasonWord = locale === 'fr' ? 'saison' : 'season';
  const queryLabel = labels.find(label => /[\p{L}\p{N}]/u.test(label)) || labels[0];
  if (!queryLabel) return null;

  const { data } = await axios.get(`https://${host}/w/api.php`, {
    headers: REQUEST_HEADERS,
    timeout: 12_000,
    params: {
      action: 'query',
      list: 'search',
      srsearch: `"${queryLabel}" "${seasonWord} ${seasonNumber}"`,
      srnamespace: 0,
      srlimit: 10,
      format: 'json',
      formatversion: 2,
      origin: '*',
    },
  });
  const results: Array<{ title?: unknown }> = Array.isArray(data?.query?.search) ? data.query.search : [];
  const ranked = results
    .map(result => ({
      title: String(result?.title || ''),
      score: scoreWikipediaTitle(String(result?.title || ''), labels, seasonWord, seasonNumber),
    }))
    .filter(candidate => candidate.title && candidate.score >= 10)
    .sort((first, second) => second.score - first.score);
  const title = ranked[0]?.title;
  if (!title) return null;

  const { data: parsed } = await axios.get(`https://${host}/w/api.php`, {
    headers: REQUEST_HEADERS,
    timeout: 15_000,
    params: {
      action: 'parse',
      page: title,
      prop: 'text|revid|displaytitle',
      disableeditsection: true,
      format: 'json',
      formatversion: 2,
      origin: '*',
    },
  });
  const html = typeof parsed?.parse?.text === 'string' ? parsed.parse.text : '';
  const text = clampText(sanitizeWikipediaHtml(html), 24_000);
  if (text.length < 240) return null;

  return {
    locale,
    title,
    text,
    revisionId: parsed?.parse?.revid ? String(parsed.parse.revid) : null,
    sourceUrl: `https://${host}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
  };
}

function scoreWikipediaTitle(
  title: string,
  labels: string[],
  seasonWord: string,
  seasonNumber: number,
): number {
  const normalizedTitle = normalizeForComparison(title);
  const normalizedMarker = normalizeForComparison(`${seasonWord} ${seasonNumber}`);
  let score = normalizedTitle.includes(normalizedMarker) ? 8 : 0;
  if (labels.some(label => normalizedTitle.includes(normalizeForComparison(label)))) score += 5;
  if (/episode|episodes|liste|list/.test(normalizedTitle)) score += 1;
  if (/film|soundtrack|musique|bande originale/.test(normalizedTitle)) score -= 5;
  return score;
}

function sanitizeWikipediaHtml(html: string): string {
  return decodeHtmlEntities(html
    .replace(/<(script|style|sup|figure|nav)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|li|tr|h[1-6]|section|div|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\[[0-9]+\]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    const namedValue = namedEntities[normalized];
    if (namedValue !== undefined) return namedValue;
    if (!normalized.startsWith('#')) return match;
    const hexadecimal = normalized.startsWith('#x');
    const codePoint = Number.parseInt(normalized.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : match;
  });
}

function getClaimValues(entity: any, property: string): string[] {
  const claims = Array.isArray(entity?.claims?.[property]) ? entity.claims[property] : [];
  return claims
    .map((claim: any) => claim?.mainsnak?.datavalue?.value)
    .filter((value: unknown): value is string => typeof value === 'string');
}

function getEntityIdClaimValues(entity: any, property: string): string[] {
  const claims = Array.isArray(entity?.claims?.[property]) ? entity.claims[property] : [];
  return claims
    .map((claim: any) => claim?.mainsnak?.datavalue?.value?.id)
    .filter((value: unknown): value is string => typeof value === 'string');
}

function getEntityLabels(entity: any): string[] {
  return uniqueStrings([
    entity?.labels?.fr?.value,
    entity?.labels?.en?.value,
  ]);
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.trim())
    .filter(Boolean)));
}

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function clampText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trim()}…`;
}

function slugify(value: string): string {
  return normalizeForComparison(value).replace(/ /g, '-').slice(0, 80);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
