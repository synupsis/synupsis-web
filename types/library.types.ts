export type LibraryEntry = {
  slug: string;
  // Null when the series is saved without episode tracking.
  season: number | null;
  episode: number;
  updatedAt: string;
};

export type LibraryListEntry = LibraryEntry & { name: string; image: string | null };
