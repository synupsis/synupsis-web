import type { RecapEvidence, RecapSourceProvider } from '~/server/services/recap-generation/types';
import { createRecapSourceProvider, getRecapSourcePolicy } from '~/server/services/recap-source-registry';

export type WikiLocale = 'fr' | 'en';

type ArticleTitles = Partial<Record<WikiLocale, string>>;

type WikidataIdentity = {
  id: string;
  labels: string[];
  articleTitles: ArticleTitles;
};

type SeasonSitelinks = {
  seasonArticleTitles: ArticleTitles;
  episodeArticleTitles: Map<number, ArticleTitles>;
};

export type EpisodeSummary = {
  text: string;
  articleTitle: string | null;
  // The episode title printed by the article, without quotes.
  title?: string | null;
  // The episode's number across the whole series, when the article prints it.
  overallNumber?: number | null;
};

/** A Trakt episode, with its number across the series to align articles split into parts. */
export type WikimediaEpisodeRef = {
  number: number;
  absoluteNumber: number | null;
  title: string;
};

type ParsedPage = {
  title: string;
  html: string;
  revisionId: string | null;
};

type PageCandidate = {
  title: string;
  scope: 'season' | 'series';
};

type Heading = {
  level: number;
  text: string;
  start: number;
  end: number;
};

const TELEVISION_INSTANCE_IDS = new Set([
  'Q15416', // television program
  'Q581714', // animated series
  'Q1259759', // miniseries
  'Q5398426', // television series
]);
const TELEVISION_SEASON_INSTANCE_ID = 'Q3464665';
const WIKI_LOCALES: WikiLocale[] = ['en', 'fr'];

// Shorter texts are promotional teasers, not plot summaries.
const MIN_EPISODE_PLOT_CHARS = 200;
const MAX_EPISODE_PLOT_CHARS = 6_000;
const MAX_SEASON_OVERVIEW_CHARS = 2_000;
// A season page summary this long already carries the plot; skip the episode article request.
const EPISODE_ARTICLE_FETCH_THRESHOLD_CHARS = 1_500;
const ARTICLE_FETCH_CONCURRENCY = 3;
const MAX_OVERALL_NUMBER_GAP = 2;
const MAX_RETRIES = 2;

const FRENCH_SEASON_ORDINALS = [
  '', 'premiere', 'deuxieme', 'troisieme', 'quatrieme', 'cinquieme', 'sixieme',
  'septieme', 'huitieme', 'neuvieme', 'dixieme', 'onzieme', 'douzieme',
];
const PLOT_HEADINGS: Record<WikiLocale, RegExp> = {
  en: /^(plot|plot summary|synopsis|summary|story)$/,
  fr: /^(resume|resume detaille|synopsis|intrigue|histoire)$/,
};

export type WikimediaRecapEnrichment = {
  providers: RecapSourceProvider[];
  seasonEvidence: RecapEvidence[];
  episodeEvidence: Map<number, RecapEvidence[]>;
  wikidataId: string | null;
};

const REQUEST_HEADERS = {
  'User-Agent': 'Synupsis/1.0 (https://github.com/synupsis/synupsis-web; recap evidence ingestion)',
};

export async function fetchWikimediaRecapEnrichment(input: {
  showName: string;
  imdbId: string | null;
  seasonNumber: number;
  episodes: WikimediaEpisodeRef[];
  fetchedAt: string;
}): Promise<WikimediaRecapEnrichment | null> {
  if (process.env.RECAP_WIKIMEDIA_ENABLED === 'false') return null;

  try {
    const identity = await fetchWikidataIdentity(input.showName, input.imdbId);
    const sitelinks = identity
      ? await fetchSeasonSitelinks(identity.id, input.seasonNumber).catch((error) => {
        console.warn('Wikidata season lookup is unavailable; continuing with title patterns.', toErrorMessage(error));
        return emptySitelinks();
      })
      : emptySitelinks();
    const labels = uniqueStrings([
      input.showName,
      ...(identity?.labels || []),
      ...Object.values(identity?.articleTitles || {}).map(stripDisambiguation),
    ]);

    const episodeEvidence = new Map<number, RecapEvidence[]>();
    const seasonEvidence: RecapEvidence[] = [];
    let firstSourceUrl: string | null = null;

    // Locales run one after the other to keep the request rate polite.
    for (const locale of WIKI_LOCALES) {
      try {
        const collected = await collectWikipediaEvidence({
          locale,
          labels,
          identity,
          sitelinks,
          seasonNumber: input.seasonNumber,
          episodes: input.episodes,
          fetchedAt: input.fetchedAt,
        });
        collected.episodeEvidence.forEach((items, episodeNumber) => {
          episodeEvidence.set(episodeNumber, [...(episodeEvidence.get(episodeNumber) || []), ...items]);
        });
        seasonEvidence.push(...collected.seasonEvidence);
        firstSourceUrl ||= collected.sourceUrl;
      } catch (error) {
        console.warn(`Wikipedia (${locale}) recap enrichment is unavailable; continuing with other sources.`, toErrorMessage(error));
      }
    }

    if (!identity && episodeEvidence.size === 0 && seasonEvidence.length === 0) return null;

    const providers: RecapSourceProvider[] = [];
    if (identity) {
      providers.push(createRecapSourceProvider(
        'wikidata',
        input.fetchedAt,
        `https://www.wikidata.org/wiki/${identity.id}`,
      ));
    }
    if (firstSourceUrl) {
      providers.push(createRecapSourceProvider('wikipedia', input.fetchedAt, firstSourceUrl));
    }

    return {
      providers,
      wikidataId: identity?.id || null,
      episodeEvidence,
      seasonEvidence,
    };
  } catch (error) {
    console.warn('Wikimedia recap enrichment is unavailable; continuing with other sources.', toErrorMessage(error));
    return null;
  }
}

async function collectWikipediaEvidence(input: {
  locale: WikiLocale;
  labels: string[];
  identity: WikidataIdentity | null;
  sitelinks: SeasonSitelinks;
  seasonNumber: number;
  episodes: WikimediaEpisodeRef[];
  fetchedAt: string;
}): Promise<{
  episodeEvidence: Map<number, RecapEvidence[]>;
  seasonEvidence: RecapEvidence[];
  sourceUrl: string | null;
}> {
  const { locale, seasonNumber, fetchedAt } = input;
  const host = `${locale}.wikipedia.org`;
  const policy = getRecapSourcePolicy('wikipedia');
  const episodeEvidence = new Map<number, RecapEvidence[]>();
  const seasonEvidence: RecapEvidence[] = [];
  let sourceUrl: string | null = null;

  const addEpisodeEvidence = (evidence: RecapEvidence) => {
    const episodeNumber = evidence.episodeNumber as number;
    episodeEvidence.set(episodeNumber, [...(episodeEvidence.get(episodeNumber) || []), evidence]);
  };

  // 1. Per-episode summaries from the season article, or from the season
  // section of an episode list or series article. A series article also
  // aligns its rows on the series-wide episode number, for shows whose
  // seasons are split into parts or numbered differently from Trakt. Later
  // pages only fill the episodes earlier ones missed.
  const summaries = new Map<number, EpisodeSummary>();
  for (const candidate of await resolveSeasonPageCandidates(host, locale, input)) {
    if (summaries.size >= input.episodes.length) break;
    const page = await fetchParsedPage(host, candidate.title).catch((error) => {
      console.warn(`Wikipedia (${locale}) page "${candidate.title}" is unavailable.`, toErrorMessage(error));
      return null;
    });
    if (!page) continue;
    const sections = candidate.scope === 'season'
      ? [page.html]
      : extractSeasonSectionsHtml(page.html, seasonNumber, locale);
    const sectionSummaries = sections.map(parseEpisodeSummaries).find(result => result.size > 0) ?? new Map();
    const parsed = candidate.scope === 'season'
      ? sectionSummaries
      : alignEpisodeSummaries(sectionSummaries, parseOverallEpisodeSummaries(page.html), input.episodes);
    const added = [...parsed].filter(([episodeNumber]) => !summaries.has(episodeNumber));
    if (!added.length) continue;

    const pageUrl = toArticleUrl(host, page.title);
    sourceUrl ||= pageUrl;
    added.forEach(([episodeNumber, summary]) => {
      summaries.set(episodeNumber, summary);
      addEpisodeEvidence(createEvidence({
        id: `wikipedia-${locale}-e${episodeNumber}-summary`,
        kind: 'episode-plot',
        episodeNumber,
        locale,
        text: summary.text,
        sourceUrl: pageUrl,
        revisionId: page.revisionId,
        licenseId: policy.licenseId,
        fetchedAt,
      }));
    });

    const overview = candidate.scope === 'season' && !seasonEvidence.length
      ? extractSeasonOverview(page.html, locale)
      : null;
    if (overview) {
      seasonEvidence.push(createEvidence({
        id: `wikipedia-${locale}-s${seasonNumber}-overview`,
        kind: 'season-synopsis',
        episodeNumber: null,
        locale,
        text: overview,
        sourceUrl: pageUrl,
        revisionId: page.revisionId,
        licenseId: policy.licenseId,
        fetchedAt,
      }));
    }
  }

  // 2. Episode articles carry the most detailed plots. Wikidata sitelinks are
  // preferred; links found in the episode table are the fallback.
  const articleTitles = new Map<number, string>();
  input.sitelinks.episodeArticleTitles.forEach((titles, episodeNumber) => {
    const title = titles[locale];
    if (title) articleTitles.set(episodeNumber, title);
  });
  summaries.forEach((summary, episodeNumber) => {
    if (!articleTitles.has(episodeNumber) && summary.articleTitle) {
      articleTitles.set(episodeNumber, summary.articleTitle);
    }
  });
  const articlesToFetch = [...articleTitles.entries()].filter(([episodeNumber]) => (
    (summaries.get(episodeNumber)?.text.length ?? 0) < EPISODE_ARTICLE_FETCH_THRESHOLD_CHARS
  ));

  const plots = await mapWithConcurrency(articlesToFetch, ARTICLE_FETCH_CONCURRENCY, async ([episodeNumber, title]) => {
    try {
      return { episodeNumber, plot: await fetchEpisodeArticlePlot(host, title, locale) };
    } catch (error) {
      console.warn(`Wikipedia (${locale}) episode article "${title}" is unavailable.`, toErrorMessage(error));
      return { episodeNumber, plot: null };
    }
  });
  plots.forEach(({ episodeNumber, plot }) => {
    if (!plot) return;
    const pageUrl = toArticleUrl(host, plot.title);
    sourceUrl ||= pageUrl;
    addEpisodeEvidence(createEvidence({
      id: `wikipedia-${locale}-e${episodeNumber}-article`,
      kind: 'episode-plot',
      episodeNumber,
      locale,
      text: plot.text,
      sourceUrl: pageUrl,
      revisionId: plot.revisionId,
      licenseId: policy.licenseId,
      fetchedAt,
    }));
  });

  return { episodeEvidence, seasonEvidence, sourceUrl };
}

async function resolveSeasonPageCandidates(
  host: string,
  locale: WikiLocale,
  input: { labels: string[]; identity: WikidataIdentity | null; sitelinks: SeasonSitelinks; seasonNumber: number },
): Promise<PageCandidate[]> {
  const { labels, seasonNumber } = input;
  const titles = uniqueStrings([
    input.sitelinks.seasonArticleTitles[locale],
    ...labels.flatMap(label => (locale === 'fr'
      ? [`Saison ${seasonNumber} de ${label}`]
      : [`${label} season ${seasonNumber}`, `${label} (TV series) season ${seasonNumber}`])),
    ...labels.map(label => (locale === 'fr' ? `Liste des épisodes de ${label}` : `List of ${label} episodes`)),
    input.identity?.articleTitles[locale],
  ]);
  const existingTitles = await resolveExistingTitles(host, titles);
  return existingTitles.map(title => ({
    title,
    scope: isSeasonTitle(title, seasonNumber, locale) ? 'season' : 'series',
  }));
}

async function resolveExistingTitles(host: string, titles: string[]): Promise<string[]> {
  if (!titles.length) return [];
  const data = await getWikimediaJson(`https://${host}/w/api.php`, {
    action: 'query',
    titles: titles.slice(0, 50).join('|'),
    redirects: 1,
  });
  const normalized = new Map<string, string>(
    (Array.isArray(data?.query?.normalized) ? data.query.normalized : []).map((item: any) => [item.from, item.to]),
  );
  const redirects = new Map<string, string>(
    (Array.isArray(data?.query?.redirects) ? data.query.redirects : []).map((item: any) => [item.from, item.to]),
  );
  const existing = new Set<string>(
    (Array.isArray(data?.query?.pages) ? data.query.pages : [])
      .filter((page: any) => page && !page.missing && !page.invalid)
      .map((page: any) => String(page.title)),
  );
  return uniqueStrings(titles.map((title) => {
    const normalizedTitle = normalized.get(title) || title;
    const resolvedTitle = redirects.get(normalizedTitle) || normalizedTitle;
    return existing.has(resolvedTitle) ? resolvedTitle : null;
  }));
}

async function fetchParsedPage(host: string, title: string): Promise<ParsedPage | null> {
  const data = await getWikimediaJson(`https://${host}/w/api.php`, {
    action: 'parse',
    page: title,
    prop: 'text|revid',
    disableeditsection: 1,
    redirects: 1,
  });
  const html = typeof data?.parse?.text === 'string' ? data.parse.text : '';
  if (!html) return null;
  return {
    title: String(data.parse.title || title),
    html,
    revisionId: data.parse.revid ? String(data.parse.revid) : null,
  };
}

async function fetchEpisodeArticlePlot(
  host: string,
  title: string,
  locale: WikiLocale,
): Promise<{ title: string; text: string; revisionId: string | null } | null> {
  const data = await getWikimediaJson(`https://${host}/w/api.php`, {
    action: 'query',
    prop: 'extracts|revisions',
    explaintext: 1,
    exsectionformat: 'wiki',
    rvprop: 'ids',
    titles: title,
    redirects: 1,
  });
  const page = Array.isArray(data?.query?.pages) ? data.query.pages[0] : null;
  if (!page || page.missing) return null;
  const text = extractPlotSection(String(page.extract || ''), locale);
  if (!text) return null;
  return {
    title: String(page.title || title),
    text,
    revisionId: page.revisions?.[0]?.revid ? String(page.revisions[0].revid) : null,
  };
}

/** Extracts the plot section of a plain-text article, keeping sub-headings as location cues. */
export function extractPlotSection(text: string, locale: WikiLocale): string | null {
  const headings = [...text.matchAll(/^(={2,6})\s*(.+?)\s*\1\s*$/gm)];
  const start = headings.find(heading => PLOT_HEADINGS[locale].test(normalizeForComparison(heading[2] ?? '')));
  if (!start || start.index === undefined) return null;
  const level = start[1]?.length ?? 2;
  const end = headings.find(heading => (
    (heading.index ?? 0) > (start.index ?? 0) && (heading[1]?.length ?? 2) <= level
  ));
  const body = text
    .slice(start.index + start[0].length, end?.index ?? text.length)
    .replace(/^={2,6}\s*(.+?)\s*={2,6}\s*$/gm, '$1 :');
  const plot = normalizePlotText(body);
  return plot.length >= MIN_EPISODE_PLOT_CHARS ? plot : null;
}

/** Returns the HTML of every section whose heading names the requested season. */
export function extractSeasonSectionsHtml(html: string, seasonNumber: number, locale: WikiLocale): string[] {
  const headings = listHeadings(html);
  return headings
    .map((heading, index) => ({ heading, index }))
    .filter(({ heading }) => isSeasonHeading(heading.text, seasonNumber, locale))
    .map(({ heading, index }) => {
      const next = headings.slice(index + 1).find(candidate => candidate.level <= heading.level);
      return html.slice(heading.end, next?.start ?? html.length);
    });
}

/** Maps season episode numbers to their summaries, from episode tables or per-episode blocks. */
export function parseEpisodeSummaries(html: string): Map<number, EpisodeSummary> {
  const summaries = parseEpisodeTableSummaries(html);
  parseEpisodeBlockSummaries(html).forEach((summary, episodeNumber) => {
    const current = summaries.get(episodeNumber);
    if (!current || summary.text.length > current.text.length) {
      summaries.set(episodeNumber, { ...summary, articleTitle: summary.articleTitle || current?.articleTitle || null });
    }
  });
  return summaries;
}

function findOverallNumber(overallSummaries: Map<number, EpisodeSummary>, summary: EpisodeSummary | null): number | null {
  if (!summary) return null;
  for (const [overallNumber, candidate] of overallSummaries) {
    if (candidate.text === summary.text) return overallNumber;
  }
  return null;
}

function parseEpisodeTableSummaries(html: string): Map<number, EpisodeSummary> {
  return new Map(parseEpisodeTableRows(html).map(row => [row.episodeNumber, row.summary]));
}

function parseEpisodeTableRows(html: string): Array<{ episodeNumber: number; summary: EpisodeSummary }> {
  const rows: Array<{ episodeNumber: number; summary: EpisodeSummary }> = [];
  const rowPattern = /<tr\b[^>]*class="[^"]*\bvevent\b[^"]*"[^>]*>([\s\S]*?)<\/tr>\s*(?:<tr\b[^>]*class="[^"]*\bexpand-child\b[^"]*"[^>]*>([\s\S]*?)<\/tr>)?/gi;

  for (const row of html.matchAll(rowPattern)) {
    const cells = [...(row[1] ?? '').matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi)];
    // Tables list the overall number in the header cell and the number
    // within the season in the first data cell, when both columns exist.
    const firstDataCell = cells.find(cell => cell[1]?.toLowerCase() === 'td');
    const headerCell = cells.find(cell => cell[1]?.toLowerCase() === 'th');
    const inSeasonNumber = parseEpisodeNumber(firstDataCell?.[3]);
    const episodeNumber = inSeasonNumber ?? parseEpisodeNumber(headerCell?.[3]);
    const description = row[2]?.match(/<td\b[^>]*class="[^"]*\bdescription\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1];
    if (!episodeNumber || !description) continue;

    const text = normalizePlotText(htmlToText(description));
    if (text.length < MIN_EPISODE_PLOT_CHARS) continue;
    const summaryCell = cells.find(cell => /\bsummary\b/.test(cell[2] ?? ''));
    rows.push({
      episodeNumber,
      summary: {
        text,
        articleTitle: extractLinkedArticleTitle(summaryCell?.[3]),
        title: summaryCell ? cleanEpisodeTitle(htmlToText(summaryCell[3] ?? '')) : null,
        overallNumber: inSeasonNumber ? parseEpisodeNumber(headerCell?.[3]) : null,
      },
    });
  }
  return rows;
}

/**
 * Summaries keyed by their number across the series: table rows that print
 * both numbers, and per-episode blocks when their numbers never restart.
 */
export function parseOverallEpisodeSummaries(html: string): Map<number, EpisodeSummary> {
  const overall = new Map<number, EpisodeSummary>();
  parseEpisodeTableRows(html).forEach(({ summary }) => {
    if (summary.overallNumber && !overall.has(summary.overallNumber)) overall.set(summary.overallNumber, summary);
  });
  const blocks = [...parseEpisodeBlockSummaries(html)];
  const increasing = blocks.every(([episodeNumber], index) => index === 0 || episodeNumber > (blocks[index - 1]?.[0] ?? 0));
  if (increasing) {
    blocks.forEach(([episodeNumber, summary]) => {
      if (!overall.has(episodeNumber)) overall.set(episodeNumber, { ...summary, overallNumber: episodeNumber });
    });
  }
  return overall;
}

/**
 * Picks each Trakt episode's summary between the season section (by number
 * in the season) and the series-wide row (by absolute number). A matching
 * title settles it; otherwise the series-wide row is trusted once another
 * episode of the season confirms the alignment, so a series split into parts
 * still finds its later episodes and a mismatched part heading is dropped.
 */
export function alignEpisodeSummaries(
  sectionSummaries: Map<number, EpisodeSummary>,
  overallSummaries: Map<number, EpisodeSummary>,
  episodes: WikimediaEpisodeRef[],
): Map<number, EpisodeSummary> {
  const candidates = episodes.map(episode => ({
    episode,
    section: sectionSummaries.get(episode.number) ?? null,
    overall: episode.absoluteNumber ? overallSummaries.get(episode.absoluteNumber) ?? null : null,
  }));
  const titleMatches = (summary: EpisodeSummary | null, episode: WikimediaEpisodeRef) => Boolean(
    summary?.title && normalizeForComparison(summary.title) === normalizeForComparison(episode.title),
  );
  const overallConfirmed = candidates.some(({ episode, section, overall }) => (
    overall && (titleMatches(overall, episode) || overall.text === section?.text)
  ));

  // A section row numbered far from the episode belongs to another part of
  // the series; a small gap is a special or a split episode counted apart.
  const sectionRow = (section: EpisodeSummary | null, episode: WikimediaEpisodeRef) => {
    const overallNumber = section?.overallNumber ?? findOverallNumber(overallSummaries, section);
    const distant = overallNumber && episode.absoluteNumber
      && Math.abs(overallNumber - episode.absoluteNumber) > MAX_OVERALL_NUMBER_GAP;
    return distant && !titleMatches(section, episode) ? null : section;
  };

  const aligned = new Map<number, EpisodeSummary>();
  candidates.forEach(({ episode, section, overall }) => {
    const selected = (overall && (titleMatches(overall, episode) || overall.text === section?.text)) ? overall
      : titleMatches(section, episode) ? section
        : overall && overallConfirmed ? overall
          : sectionRow(section, episode);
    if (selected) aligned.set(episode.number, selected);
  });
  return aligned;
}

function parseEpisodeBlockSummaries(html: string): Map<number, EpisodeSummary> {
  const summaries = new Map<number, EpisodeSummary>();
  const headings = listHeadings(html);

  headings.forEach((heading, index) => {
    const episodeNumber = Number(normalizeForComparison(heading.text).match(/^episode (\d{1,3})\b/)?.[1]);
    if (!episodeNumber) return;
    const next = headings.slice(index + 1).find(candidate => candidate.level <= heading.level);
    const block = html.slice(heading.end, next?.start ?? html.length);
    const text = extractLabelledSummary(block) ?? extractParagraphSummary(block);
    if (!text || text.length < MIN_EPISODE_PLOT_CHARS) return;
    const detailedArticle = block.match(/Article détaillé[\s\S]{0,300}?(<a\b[^>]*>)/i)?.[1];
    summaries.set(episodeNumber, {
      text,
      articleTitle: extractLinkedArticleTitle(detailedArticle),
      title: heading.text.includes(':') ? cleanEpisodeTitle(heading.text.slice(heading.text.indexOf(':') + 1)) : null,
    });
  });
  return summaries;
}

// French season articles describe each episode as bold labels followed by a
// value: "Titre original", "Réalisation", "Résumé détaillé"...
function extractLabelledSummary(block: string): string | null {
  const labels = [...block.matchAll(/<b>([^<]{2,80})<\/b>\s*(?:<br\s*\/?>|:|&#160;:)/gi)];
  const index = labels.findIndex(label => normalizeForComparison(label[1] ?? '').startsWith('resume'));
  const label = labels[index];
  if (!label) return null;
  const start = (label.index ?? 0) + label[0].length;
  const end = labels[index + 1]?.index ?? block.length;
  return normalizePlotText(htmlToText(block.slice(start, end))) || null;
}

function extractParagraphSummary(block: string): string | null {
  if (/<b>[^<]{2,80}<\/b>\s*(?:<br\s*\/?>|:|&#160;:)/i.test(block)) return null;
  const paragraphs = [...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(match => htmlToText(match[1] ?? ''));
  return normalizePlotText(paragraphs.join(' ')) || null;
}

/** Season overview: the lead of an English season article, or the French season synopsis section. */
export function extractSeasonOverview(html: string, locale: WikiLocale): string | null {
  const headings = listHeadings(html);
  let section = html.slice(0, headings[0]?.start ?? html.length);
  if (locale === 'fr') {
    const index = headings.findIndex(heading => (
      /^(resume de la saison|synopsis|resume)$/.test(normalizeForComparison(heading.text))
    ));
    const heading = headings[index];
    if (!heading) return null;
    const next = headings.slice(index + 1).find(candidate => candidate.level <= heading.level);
    section = html.slice(heading.end, next?.start ?? html.length);
  }
  const paragraphs = [...section.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(match => htmlToText(match[1] ?? ''));
  const text = clampText(normalizePlotText(paragraphs.join(' ')), MAX_SEASON_OVERVIEW_CHARS);
  return text.length >= MIN_EPISODE_PLOT_CHARS ? text : null;
}

async function fetchWikidataIdentity(
  showName: string,
  imdbId: string | null,
): Promise<WikidataIdentity | null> {
  const imdbMatches = imdbId ? await searchWikidata(`haswbstatement:P345=${imdbId}`) : [];
  const candidateIds = imdbMatches.length
    ? imdbMatches.slice(0, 5)
    : await searchWikidataLabels(showName);
  if (!candidateIds.length) return null;

  const entities = await fetchWikidataEntities(candidateIds, 'claims|labels|sitelinks');
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
    articleTitles: getArticleTitles(selected),
  };
}

async function searchWikidataLabels(showName: string): Promise<string[]> {
  const searches = await Promise.all(['fr', 'en'].map(async (language) => {
    const data = await getWikimediaJson('https://www.wikidata.org/w/api.php', {
      action: 'wbsearchentities',
      search: showName,
      language,
      uselang: language,
      type: 'item',
      limit: 8,
    });
    return Array.isArray(data?.search) ? data.search : [];
  }));
  return uniqueStrings(searches.flat().map(candidate => candidate?.id)).slice(0, 12);
}

async function fetchSeasonSitelinks(showId: string, seasonNumber: number): Promise<SeasonSitelinks> {
  const seasonIds = await searchWikidata(
    `haswbstatement:P179=${showId} haswbstatement:P31=${TELEVISION_SEASON_INSTANCE_ID}`,
  );
  const seasons = await fetchWikidataEntities(seasonIds, 'claims|sitelinks');
  const season = seasons.find(entity => getQualifiedOrdinal(entity, 'P179', showId) === seasonNumber);
  if (!season?.id) return emptySitelinks();

  const episodeIds = await searchWikidata(`haswbstatement:P4908=${season.id}`);
  const episodes = await fetchWikidataEntities(episodeIds, 'claims|sitelinks');
  const episodeArticleTitles = new Map<number, ArticleTitles>();
  episodes.forEach((entity) => {
    const episodeNumber = getQualifiedOrdinal(entity, 'P4908', String(season.id));
    const titles = getArticleTitles(entity);
    if (episodeNumber && (titles.en || titles.fr)) episodeArticleTitles.set(episodeNumber, titles);
  });

  return { seasonArticleTitles: getArticleTitles(season), episodeArticleTitles };
}

async function searchWikidata(query: string): Promise<string[]> {
  const data = await getWikimediaJson('https://www.wikidata.org/w/api.php', {
    action: 'query',
    list: 'search',
    srsearch: query,
    srnamespace: 0,
    srlimit: 50,
  });
  return uniqueStrings((Array.isArray(data?.query?.search) ? data.query.search : []).map((item: any) => item?.title));
}

async function fetchWikidataEntities(ids: string[], props: string): Promise<any[]> {
  const entities: any[] = [];
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50);
    const data = await getWikimediaJson('https://www.wikidata.org/w/api.php', {
      action: 'wbgetentities',
      ids: batch.join('|'),
      props,
      languages: 'fr|en',
      sitefilter: 'enwiki|frwiki',
    });
    entities.push(...batch.map(id => data?.entities?.[id]).filter(Boolean));
  }
  return entities;
}

async function getWikimediaJson(url: string, params: Record<string, string | number>): Promise<any> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await $fetch<any>(url, {
        headers: REQUEST_HEADERS,
        timeout: 15_000,
        query: { format: 'json', formatversion: 2, ...params },
        // This loop handles retries and honours Retry-After.
        retry: 0,
      });
    } catch (error) {
      const response = (error as { response?: Response } | undefined)?.response;
      const status = response?.status;
      if ((status !== 429 && status !== 503) || attempt >= MAX_RETRIES) throw error;
      const retryAfterSeconds = Number(response?.headers.get('retry-after') ?? Number.NaN);
      const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(retryAfterSeconds, 5) * 1_000
        : 1_000 * (attempt + 1);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

function createEvidence(input: {
  id: string;
  kind: RecapEvidence['kind'];
  episodeNumber: number | null;
  locale: WikiLocale;
  text: string;
  sourceUrl: string;
  revisionId: string | null;
  licenseId: string;
  fetchedAt: string;
}): RecapEvidence {
  return {
    id: input.id,
    providerId: 'wikipedia',
    kind: input.kind,
    episodeNumber: input.episodeNumber,
    locale: input.locale,
    text: clampText(input.text, MAX_EPISODE_PLOT_CHARS),
    sourceUrl: input.sourceUrl,
    trustTier: 'reference',
    licenseId: input.licenseId,
    retrievedAt: input.fetchedAt,
    revisionId: input.revisionId,
  };
}

function emptySitelinks(): SeasonSitelinks {
  return { seasonArticleTitles: {}, episodeArticleTitles: new Map() };
}

function isSeasonTitle(title: string, seasonNumber: number, locale: WikiLocale): boolean {
  const normalized = normalizeForComparison(title);
  return locale === 'fr'
    ? new RegExp(`\\bsaison ${seasonNumber}\\b`).test(normalized)
    : new RegExp(`\\b(season|series) ${seasonNumber}\\b`).test(normalized);
}

function isSeasonHeading(text: string, seasonNumber: number, locale: WikiLocale): boolean {
  const normalized = normalizeForComparison(text);
  const patterns = [new RegExp(`^(season|series|saison|part|partie) ${seasonNumber}\\b`)];
  if (locale === 'fr') {
    patterns.push(new RegExp(`^${seasonNumber}(e|re|er|eme) saison\\b`));
    const ordinal = FRENCH_SEASON_ORDINALS[seasonNumber];
    if (ordinal) patterns.push(new RegExp(`^${ordinal} saison\\b`));
    if (seasonNumber === 2) patterns.push(/^seconde saison\b/);
  }
  return patterns.some(pattern => pattern.test(normalized));
}

function listHeadings(html: string): Heading[] {
  return [...html.matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(match => ({
    level: Number(match[1]),
    text: htmlToText(match[2] ?? ''),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function parseEpisodeNumber(cellHtml?: string): number | null {
  if (!cellHtml) return null;
  const text = htmlToText(cellHtml);
  return /^\d{1,3}$/.test(text) ? Number(text) : null;
}

function cleanEpisodeTitle(text: string): string | null {
  return text.replace(/^["“«\s]+|["”»\s]+$/g, '').trim() || null;
}

function extractLinkedArticleTitle(html?: string): string | null {
  const link = html?.match(/<a\b[^>]*>/i)?.[0];
  if (!link || /\bclass="[^"]*\bnew\b/.test(link)) return null;
  const title = link.match(/\btitle="([^"]+)"/)?.[1];
  return title ? decodeHtmlEntities(title) : null;
}

function toArticleUrl(host: string, title: string): string {
  return `https://${host}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<sup\b[^>]*class="[^"]*\breference\b[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, ' ')
    .replace(/<span\b[^>]*class="[^"]*\bmw-editsection\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|tr|dd|dt|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\[(?:\d+|[a-z]|note \d+|n \d+)\]/gi, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizePlotText(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\s+([,.;:!?)])/g, '$1').trim();
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    hellip: '…',
    laquo: '«',
    lsquo: '‘',
    lt: '<',
    mdash: '—',
    nbsp: ' ',
    ndash: '–',
    quot: '"',
    raquo: '»',
    rsquo: '’',
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

// Seasons and episodes store their position as a "series ordinal" (P1545)
// qualifier on the statement that links them to their parent.
function getQualifiedOrdinal(entity: any, property: string, parentId: string): number | null {
  const claims = Array.isArray(entity?.claims?.[property]) ? entity.claims[property] : [];
  const claim = claims.find((item: any) => item?.mainsnak?.datavalue?.value?.id === parentId);
  const ordinal = Number(claim?.qualifiers?.P1545?.[0]?.datavalue?.value);
  return Number.isInteger(ordinal) && ordinal > 0 ? ordinal : null;
}

function getArticleTitles(entity: any): ArticleTitles {
  return {
    en: typeof entity?.sitelinks?.enwiki?.title === 'string' ? entity.sitelinks.enwiki.title : undefined,
    fr: typeof entity?.sitelinks?.frwiki?.title === 'string' ? entity.sitelinks.frwiki.title : undefined,
  };
}

function getEntityLabels(entity: any): string[] {
  return uniqueStrings([
    entity?.labels?.fr?.value,
    entity?.labels?.en?.value,
  ]);
}

function stripDisambiguation(title: string | undefined): string | undefined {
  return title?.replace(/\s*\([^)]*\)\s*$/, '').trim() || undefined;
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
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function clampText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trim()}…`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
