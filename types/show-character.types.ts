export type CharacterImageKind = 'character' | 'actor';
export type CharacterImageProvider = 'tvmaze' | 'trakt';

export type ShowCharacterProfile = {
  name: string;
  imageUrl: string | null;
  imageKind: CharacterImageKind | null;
  imageProvider: CharacterImageProvider | null;
  actorName: string | null;
  isVoice: boolean;
  sourceUrl: string | null;
};

export type TimelineCharacterKeyEvent = {
  id: string;
  title: string;
  seasonNumber: number;
  episodeNumber: number;
};

export type TimelineCharacterProfile = ShowCharacterProfile & {
  seasonNumbers: number[];
  eventCount: number;
  lastSeen: {
    seasonNumber: number;
    episodeNumber: number;
  } | null;
  arcs: string[];
  keyEvents: TimelineCharacterKeyEvent[];
};
