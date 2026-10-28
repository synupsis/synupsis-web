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

/** A character of the series' cast, with the episodes they appear in, season by season. */
export type ShowCastCharacter = {
  name: string;
  actorName: string;
  // The actor's headshot; the page prefers a character portrait when one is known.
  actorImageUrl: string | null;
  episodesBySeason: Record<number, number>;
};

/** A character as the viewer sees it: within their seasons, with their episodes there. */
export type VisibleCastCharacter = Omit<ShowCastCharacter, 'episodesBySeason'> & { episodeCount: number };
