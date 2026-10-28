import type { Database as DatabaseGenerated } from './generated/database';
import type { ShowCharacterProfile } from './show-character.types';

export type { Json } from './generated/database';

export type Database = DatabaseGenerated;

export type Show = Database['public']['Tables']['show']['Row'];
export type Season = Database['public']['Tables']['season']['Row'];
export type Prompt = Database['public']['Tables']['prompts']['Row'] & {
  recaps_count?: Array<{ count: number | null }>;
};
export type Recap = Database['public']['Tables']['recap']['Row'];
export type SeasonWithRecaps = Season & { recap: Recap[] };
/** Trakt's community rating, out of 10. */
export type ShowRating = { value: number; votes: number };
export type ShowWithSeasons = Show & {
  seasons: SeasonWithRecaps[];
  _embedded?: {
    cast?: unknown[];
    characterProfiles?: ShowCharacterProfile[];
    // Missing when Trakt is unreachable or has no votes.
    rating?: ShowRating | null;
  };
};
