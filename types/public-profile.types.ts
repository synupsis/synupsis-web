/** A viewer's public page, as anyone sees it. */
export type PublicProfile = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  memberSince: string;
  /** Whether the signed-in viewer is looking at their own page. */
  isOwn: boolean;
};

/** Only contributions shown with the viewer's name count. */
export type PublicProfileStats = {
  recaps: number;
  /** Views of their recaps by other viewers. */
  views: number;
  comments: number;
  acceptedSuggestions: number;
};

/** A recap the viewer unlocked, which shows their name. */
export type PublicProfileRecap = {
  id: string;
  locale: string;
  showName: string;
  showPath: string;
  seasonNumber: number;
  image: string | null;
  views: number;
  unlockedAt: string;
};

export type PublicProfileComment = {
  kind: 'comment';
  id: string;
  createdAt: string;
  showName: string;
  showPath: string;
  season: number;
  episode: number;
  isReply: boolean;
  isSpoiler: boolean;
  likeCount: number;
  /** Null when the viewer has not watched the episode: comments spoil what comes before them. */
  body: string | null;
};

/** Only what the suggestion is about: its text could spoil the season. */
export type PublicProfileSuggestion = {
  kind: 'suggestion';
  id: string;
  createdAt: string;
  recapId: string;
  showName: string;
  showPath: string;
  seasonNumber: number;
  suggestionKind: 'text' | 'change' | 'add';
  status: 'pending' | 'accepted';
  likeCount: number;
};

export type PublicProfileActivity = PublicProfileComment | PublicProfileSuggestion;

export type PublicProfilePayload = {
  profile: PublicProfile;
  stats: PublicProfileStats;
  recaps: PublicProfileRecap[];
};

/** The owner's editable side of the page, on the settings page. */
export type OwnPublicProfile = {
  handle: string | null;
  displayName: string | null;
  bio: string | null;
};
