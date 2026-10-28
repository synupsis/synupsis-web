import { inflateRawSync } from 'node:zlib';
import type { SubtitleFile, SubtitleProvider, SubtitleQuery } from '~/server/services/subtitle-recap-source';

const API_URL = 'https://api.subdl.com/api/v1/subtitles';
const DOWNLOAD_URL = 'https://dl.subdl.com';
const USER_AGENT = 'Synupsis v1.0';
const MAX_CACHED_ARCHIVES = 20;

// A season pack serves every episode of its season: it is downloaded once.
const archiveCache = new Map<string, Promise<Buffer>>();

// Subdl names some languages in full instead of by their code.
const LANGUAGE_NAMES: Record<string, string> = {
  arabic: 'ar', chinese: 'zh', dutch: 'nl', english: 'en', french: 'fr', german: 'de', italian: 'it',
  japanese: 'ja', korean: 'ko', portuguese: 'pt', russian: 'ru', spanish: 'es', swedish: 'sv', turkish: 'tr',
};

export const subdlProvider: SubtitleProvider = {
  id: 'subdl',
  isConfigured: () => Boolean(process.env.SUBDL_API_KEY),
  search: searchEpisodeSubtitle,
};

async function searchEpisodeSubtitle(query: SubtitleQuery): Promise<SubtitleFile[]> {
  // Subdl numbers seasons like TMDB, as Trakt does; the IMDb id is the fallback.
  const show = query.showTmdbId
    ? { tmdb_id: query.showTmdbId }
    : query.showImdbId ? { imdb_id: query.showImdbId } : null;
  if (!show) return [];
  const data = await $fetch<any>(API_URL, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    timeout: 15_000,
    query: {
      api_key: process.env.SUBDL_API_KEY,
      ...show,
      type: 'tv',
      season_number: query.seasonNumber,
      episode_number: query.episodeNumber,
      languages: query.languages.map(language => language.toUpperCase()).join(','),
      subs_per_page: 30,
    },
  });
  if (data?.status === false) return [];

  // Files of this one episode come before season packs, which are opened to
  // find its file.
  const items = (Array.isArray(data?.subtitles) ? data.subtitles : []).filter((item: any) => coversEpisode(item, query));
  return [...items.filter((item: any) => !item.full_season), ...items.filter((item: any) => item.full_season)]
    .flatMap((item: any): SubtitleFile[] => {
      const path = typeof item?.url === 'string' ? item.url : '';
      if (!path) return [];
      const url = path.startsWith('http') ? path : `${DOWNLOAD_URL}${path}`;
      const page = typeof item.subtitlePage === 'string' && item.subtitlePage.startsWith('/') ? `https://subdl.com${item.subtitlePage}` : null;
      return [{
        // The download URL carries the API key: the key keeps only its path.
        key: `subdl:${path.split('?')[0]}`,
        language: normalizeLanguage(item.language ?? item.lang),
        hearingImpaired: Boolean(item.hi),
        downloadCount: Number(item.downloads ?? item.download_count) || 0,
        url: page,
        download: () => downloadSubtitle(url, query, Boolean(item.full_season)),
      }];
    });
}

/** Files of this episode, or season packs of its season. */
function coversEpisode(item: any, query: SubtitleQuery): boolean {
  const season = Number(item?.season);
  if (season > 0 && season !== query.seasonNumber) return false;
  if (item?.full_season) return true;
  const from = Number(item?.episode_from);
  const end = Number(item?.episode_end);
  if (from > 0 && end > 0) return from === end && from === query.episodeNumber;
  const episode = Number(item?.episode);
  return !(episode > 0) || episode === query.episodeNumber;
}

function normalizeLanguage(value: unknown): string {
  const language = String(value ?? '').toLocaleLowerCase();
  return LANGUAGE_NAMES[language] ?? language.slice(0, 2);
}

async function downloadSubtitle(url: string, query: SubtitleQuery, seasonPack: boolean): Promise<string> {
  const archive = await downloadArchive(url);
  const file = archive.subarray(0, 2).toString('latin1') === 'PK'
    ? pickEpisodeFile(readZipEntries(archive), query, { requireNumber: seasonPack })
    : archive;
  if (!file) throw new Error('The Subdl archive holds no subtitle file for this episode.');
  return decodeSubtitle(file);
}

function downloadArchive(url: string): Promise<Buffer> {
  let archive = archiveCache.get(url);
  if (!archive) {
    if (archiveCache.size >= MAX_CACHED_ARCHIVES) archiveCache.delete(archiveCache.keys().next().value as string);
    archive = $fetch<ArrayBuffer>(url, { headers: { 'User-Agent': USER_AGENT }, responseType: 'arrayBuffer', timeout: 30_000 })
      .then(data => Buffer.from(data));
    archive.catch(() => archiveCache.delete(url));
    archiveCache.set(url, archive);
  }
  return archive;
}

/**
 * The episode's .srt file in an archive: the only one, or the one whose name
 * gives this episode's number (always for a season pack). An archive of
 * several episodes without numbers is skipped rather than guessed.
 */
export function pickEpisodeFile(
  entries: Array<{ name: string; data: Buffer }>,
  query: Pick<SubtitleQuery, 'seasonNumber' | 'episodeNumber'>,
  options: { requireNumber?: boolean } = {},
): Buffer | null {
  const subtitles = entries.filter(entry => /\.srt$/i.test(entry.name));
  if (subtitles.length === 1 && !options.requireNumber) return subtitles[0]?.data ?? null;
  const numbered = subtitles.find((entry) => {
    const match = entry.name.match(/s0*(\d{1,2})[ ._-]*e0*(\d{1,3})(?!\d)/i) ?? entry.name.match(/(?<!\d)0*(\d{1,2})x0*(\d{1,3})(?!\d)/i);
    return Number(match?.[1]) === query.seasonNumber && Number(match?.[2]) === query.episodeNumber;
  });
  return numbered?.data ?? null;
}

/** Stored and deflated entries of a zip archive, read from its central directory. */
export function readZipEntries(archive: Buffer): Array<{ name: string; data: Buffer }> {
  let end = archive.length - 22;
  while (end >= 0 && archive.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('The archive is not a valid zip file.');

  const entries: Array<{ name: string; data: Buffer }> = [];
  let offset = archive.readUInt32LE(end + 16);
  for (let index = archive.readUInt16LE(end + 10); index > 0 && archive.readUInt32LE(offset) === 0x02014b50; index -= 1) {
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    offset += 46 + nameLength + extraLength + commentLength;

    const dataStart = localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28);
    const compressed = archive.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) entries.push({ name, data: compressed });
    else if (method === 8) entries.push({ name, data: inflateRawSync(compressed) });
  }
  return entries;
}

/** UTF-8 when the bytes are valid, UTF-16 with a byte order mark, else Windows-1252 (older French files). */
export function decodeSubtitle(data: Buffer): string {
  if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder('utf-16le').decode(data);
  if (data[0] === 0xfe && data[1] === 0xff) return new TextDecoder('utf-16be').decode(data);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return new TextDecoder('windows-1252').decode(data);
  }
}
