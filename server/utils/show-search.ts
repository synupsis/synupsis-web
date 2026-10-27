import type { TraktShowCard } from '../../types/trakt.types';

export const SHOW_SEARCH_LIMIT = 24;
export const SHOW_SEARCH_MAX_LENGTH = 100;

export function normalizeShowSearchQuery(query: string): string {
  return query.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

// Trakt treats these characters as query operators. A series title is literal text.
export function escapeShowSearchQuery(query: string): string {
  return query.replace(/[+\-&|!(){}[\]^"~*?:/\\]/g, '\\$&');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeTitle(title: string): string {
  return title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function posterUrl(images: unknown): string {
  const posters = asRecord(images)?.poster;
  if (!Array.isArray(posters)) return '';

  for (const poster of posters) {
    if (typeof poster !== 'string' || !poster.trim()) continue;
    try {
      const url = new URL(poster.includes('://') ? poster : `https://${poster.replace(/^\/\//, '')}`);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    } catch {
      // An unavailable poster must never remove an otherwise valid search result.
    }
  }
  return '';
}

export function mapShowSearchResults(payload: unknown, query: string): TraktShowCard[] {
  if (!Array.isArray(payload)) return [];

  const seen = new Set<number>();
  const shows: TraktShowCard[] = [];
  for (const entry of payload) {
    const show = asRecord(asRecord(entry)?.show);
    const ids = asRecord(show?.ids);
    const traktId = ids?.trakt;
    const slug = ids?.slug;
    const name = show?.title;
    if (!show || typeof traktId !== 'number' || !Number.isSafeInteger(traktId) || traktId <= 0
      || typeof slug !== 'string' || !slug.trim() || typeof name !== 'string' || !name.trim()
      || seen.has(traktId)) continue;

    seen.add(traktId);
    shows.push({
      traktId,
      slug: slug.trim(),
      name: name.trim(),
      image: posterUrl(show.images),
      year: typeof show.year === 'number' && Number.isInteger(show.year) && show.year > 0 ? show.year : null,
      overview: typeof show.overview === 'string' ? show.overview.trim() : '',
      rating: typeof show.rating === 'number' && Number.isFinite(show.rating) && show.rating >= 0 && show.rating <= 10
        ? show.rating : null,
      genres: Array.isArray(show.genres)
        ? show.genres.filter((genre): genre is string => typeof genre === 'string' && genre.length > 0)
        : [],
    });
  }

  const normalizedQuery = normalizeTitle(query);
  const relevance = (show: TraktShowCard): number => {
    if (!normalizedQuery) return 2;
    const title = normalizeTitle(show.name);
    if (title === normalizedQuery) return 0;
    return title.startsWith(normalizedQuery) ? 1 : 2;
  };

  // Stable sorting preserves Trakt's relevance for translations, aliases and other matches.
  return shows.sort((left, right) => relevance(left) - relevance(right)).slice(0, SHOW_SEARCH_LIMIT);
}
