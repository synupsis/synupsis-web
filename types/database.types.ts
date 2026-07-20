import type { Database as DatabaseGenerated } from './database-generated.types';

export type { Json } from './database-generated.types';

export type Database = DatabaseGenerated;

export type Show = Database['public']['Tables']['show']['Row'];
export type Season = Database['public']['Tables']['season']['Row'];
export type AppSetting = Database['public']['Tables']['app_settings']['Row'];
export type Prompt = Database['public']['Tables']['prompts']['Row'] & {
  recaps_count?: Array<{ count: number | null }>;
};
export type Recap = Database['public']['Tables']['recap']['Row'];
export type SeasonWithRecaps = Season & { recap: Recap[] };
export type ShowWithSeasons = Show & {
  seasons: SeasonWithRecaps[];
  _embedded?: { cast?: unknown[] };
};
