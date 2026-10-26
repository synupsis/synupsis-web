import type { ShowCharacterProfile } from '~/types/show-character.types';

type TraktShowIds = {
  imdb?: string | null;
  tvdb?: number | null;
};

type TvMazeImage = {
  medium?: string | null;
  original?: string | null;
};

type TvMazeCastMember = {
  person?: {
    name?: string | null;
    image?: TvMazeImage | null;
  } | null;
  character?: {
    name?: string | null;
    url?: string | null;
    image?: TvMazeImage | null;
  } | null;
  voice?: boolean;
};

export type TvMazeLookup = {
  type: 'imdb' | 'thetvdb';
  value: string;
};

export function selectTvMazeLookup(ids: TraktShowIds | null | undefined): TvMazeLookup | null {
  const imdbId = typeof ids?.imdb === 'string' ? ids.imdb.trim() : '';
  if (/^tt\d+$/i.test(imdbId)) return { type: 'imdb', value: imdbId };

  const tvdbId = Number(ids?.tvdb);
  if (Number.isInteger(tvdbId) && tvdbId > 0) {
    return { type: 'thetvdb', value: String(tvdbId) };
  }

  return null;
}

export function toTvMazeCharacterProfiles(value: unknown): ShowCharacterProfile[] {
  if (!Array.isArray(value)) return [];

  const profiles = new Map<string, ShowCharacterProfile>();
  for (const rawMember of value) {
    const member = rawMember as TvMazeCastMember;
    const name = cleanText(member.character?.name);
    if (!name) continue;

    const characterImage = imageUrl(member.character?.image);
    const actorImage = imageUrl(member.person?.image);
    const profile: ShowCharacterProfile = {
      name,
      imageUrl: characterImage ?? actorImage,
      imageKind: characterImage ? 'character' : actorImage ? 'actor' : null,
      imageProvider: characterImage || actorImage ? 'tvmaze' : null,
      actorName: cleanText(member.person?.name),
      isVoice: member.voice === true,
      sourceUrl: safeTvMazeUrl(member.character?.url),
    };

    const key = normalizeCharacterName(name);
    const existing = profiles.get(key);
    if (!existing || profileScore(profile) > profileScore(existing)) profiles.set(key, profile);
  }

  return [...profiles.values()];
}

export function normalizeCharacterName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function imageUrl(image: TvMazeImage | null | undefined): string | null {
  const value = cleanText(image?.medium) ?? cleanText(image?.original);
  if (!value) return null;
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === 'https:' && parsedUrl.hostname === 'static.tvmaze.com'
      ? parsedUrl.toString()
      : null;
  } catch {
    return null;
  }
}

function safeTvMazeUrl(value: unknown): string | null {
  const url = cleanText(value);
  if (!url) return null;
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'https:' && parsedUrl.hostname === 'www.tvmaze.com'
      ? parsedUrl.toString()
      : null;
  } catch {
    return null;
  }
}

function profileScore(profile: ShowCharacterProfile) {
  return (profile.imageKind === 'character' ? 4 : profile.imageKind === 'actor' ? 2 : 0)
    + (profile.actorName ? 1 : 0);
}
