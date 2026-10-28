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
