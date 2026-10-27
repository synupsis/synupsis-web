export type TraktShowCard = {
  traktId: number;
  slug: string;
  name: string;
  image: string;
  year?: number | null;
  overview?: string;
  rating?: number | null;
  genres?: string[];
};
