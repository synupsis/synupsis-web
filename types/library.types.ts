export type LibraryEntry = {
  slug: string;
  // Null when the series is saved without episode tracking.
  season: number | null;
  episode: number;
  // Independent of viewing progress, saved for this user and series.
  spoilerShieldEnabled: boolean;
  updatedAt: string;
};

export type LibraryListEntry = LibraryEntry & { name: string; image: string | null };

export type HomeLibraryEntry = LibraryListEntry & { isCaughtUp: boolean };
