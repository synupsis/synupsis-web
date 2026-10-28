import type { SubtitleFile, SubtitleProvider, SubtitleQuery } from '~/server/services/subtitle-recap-source';

const API_URL = 'https://api.opensubtitles.com/api/v1';
const USER_AGENT = 'Synupsis v1.0';

let loginToken: Promise<string | null> | null = null;

export const openSubtitlesProvider: SubtitleProvider = {
  id: 'opensubtitles',
  isConfigured: () => Boolean(process.env.OPENSUBTITLES_API_KEY),
  search: searchEpisodeSubtitle,
};

async function searchEpisodeSubtitle(query: SubtitleQuery): Promise<SubtitleFile[]> {
  const apiKey = process.env.OPENSUBTITLES_API_KEY as string;
  // The episode's own IMDb id survives seasons split into parts; the show's
  // id with season and episode numbers is the fallback.
  const target = query.episodeImdbId
    ? { imdb_id: toImdbNumber(query.episodeImdbId) }
    : {
        episode_number: query.episodeNumber,
        parent_imdb_id: toImdbNumber(query.showImdbId),
        season_number: query.seasonNumber,
      };
  if (!('imdb_id' in target ? target.imdb_id : target.parent_imdb_id)) return [];
  const data = await $fetch<any>(`${API_URL}/subtitles`, {
    headers: await createHeaders(apiKey),
    timeout: 15_000,
    // The API redirects unless parameters and their values are sorted.
    query: sortQuery({
      ...target,
      ai_translated: 'exclude',
      languages: [...query.languages].sort().join(','),
      machine_translated: 'exclude',
      order_by: 'download_count',
    }),
  });
  const files: SubtitleFile[] = (Array.isArray(data?.data) ? data.data : []).flatMap((item: any) => {
    const fileId = Number(item?.attributes?.files?.[0]?.file_id);
    if (!Number.isInteger(fileId) || fileId <= 0) return [];
    return [{
      key: `opensubtitles:${fileId}`,
      language: String(item.attributes.language || '').slice(0, 2).toLocaleLowerCase(),
      hearingImpaired: Boolean(item.attributes.hearing_impaired),
      downloadCount: Number(item.attributes.download_count) || 0,
      url: typeof item.attributes.url === 'string' ? item.attributes.url : null,
      download: () => downloadSubtitle(apiKey, fileId),
    }];
  });
  return files;
}

async function downloadSubtitle(apiKey: string, fileId: number): Promise<string> {
  const { link } = await $fetch<{ link?: string }>(`${API_URL}/download`, {
    method: 'POST',
    headers: await createHeaders(apiKey),
    timeout: 15_000,
    body: { file_id: fileId, sub_format: 'srt' },
  });
  if (!link) throw new Error('OpenSubtitles returned no download link.');
  return await $fetch<string>(link, { responseType: 'text', timeout: 30_000 });
}

/**
 * Logging in raises the daily download quota from the anonymous one; without
 * OPENSUBTITLES_USERNAME and OPENSUBTITLES_PASSWORD, requests stay anonymous.
 */
async function createHeaders(apiKey: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Api-Key': apiKey, 'User-Agent': USER_AGENT, Accept: 'application/json' };
  const token = await getLoginToken(apiKey);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function getLoginToken(apiKey: string): Promise<string | null> {
  const username = process.env.OPENSUBTITLES_USERNAME;
  const password = process.env.OPENSUBTITLES_PASSWORD;
  if (!username || !password) return Promise.resolve(null);
  loginToken ||= $fetch<{ token?: string }>(`${API_URL}/login`, {
    method: 'POST',
    headers: { 'Api-Key': apiKey, 'User-Agent': USER_AGENT, Accept: 'application/json' },
    timeout: 15_000,
    body: { username, password },
  })
    .then(response => response.token || null)
    .catch((error) => {
      console.warn('OpenSubtitles login failed; continuing anonymously.', error instanceof Error ? error.message : String(error));
      loginToken = null;
      return null;
    });
  return loginToken;
}

function toImdbNumber(imdbId: string | null): number | undefined {
  const value = Number(String(imdbId ?? '').replace(/^tt/, ''));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function sortQuery(query: Record<string, string | number | undefined>): Record<string, string | number> {
  return Object.fromEntries(Object.entries(query)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .sort(([first], [second]) => first.localeCompare(second)));
}
