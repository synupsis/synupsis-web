import type { MergeDeep } from 'type-fest';
import type { Database as DatabaseGenerated, Json } from './database-generated.types';

export type { Json } from './database-generated.types';

// Override the type for a specific column in a view:
export type Database = MergeDeep<
  DatabaseGenerated,
  {
    public: {
      Tables: {
        profile: {
          Row: {
            role: 'admin' | 'user';
          };
          Insert: {
            role?: 'admin' | 'user';
          };
          Update: {
            role?: 'admin' | 'user';
          };
        };
        app_settings: {
          Row: {
            key: string;
            value: Json;
            updated_at: string;
          };
          Insert: {
            key: string;
            value?: Json;
            updated_at?: string;
          };
          Update: {
            key?: string;
            value?: Json;
            updated_at?: string;
          };
        };
        prompts: {
          Row: {
            id: string;
            name: string;
            content: string;
            is_active: boolean;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            name: string;
            content: string;
            is_active?: boolean;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            name?: string;
            content?: string;
            is_active?: boolean;
            created_at?: string;
            updated_at?: string;
          };
        };
        recap: {
          Row: {
            prompt_id: string | null;
          };
          Insert: {
            prompt_id?: string | null;
          };
          Update: {
            prompt_id?: string | null;
          };
        };
        season: {
          Row: {
            first_aired: string | null;
            image: string | null;
            trakt_id: number;
          };
          Insert: {
            first_aired?: string | null;
            image?: string | null;
            trakt_id: number;
          };
          Update: {
            first_aired?: string | null;
            image?: string | null;
            trakt_id?: number;
          };
        };
        show: {
          Row: {
            trakt_id: number;
          };
          Insert: {
            trakt_id: number;
          };
          Update: {
            trakt_id?: number;
          };
        };
      };
      Views: {
        movies_view: {
          Row: {
            // id is a primary key in public.movies, so it must be `not null`
            id: number;
          };
        };
        user_profiles: {
          Row: {
            email: string | null;
            id: string | null;
            role: 'admin' | 'user' | null;
            user_id: string | null;
          };
        };
      };
    };
  }
>;

export type Show = Database['public']['Tables']['show']['Row'];
export type Season = Database['public']['Tables']['season']['Row'];
export type AppSetting = Database['public']['Tables']['app_settings']['Row'];
export type Prompt = Database['public']['Tables']['prompts']['Row'] & {
  recaps_count?: Array<{ count: number | null }>;
};
export type Recap = Database['public']['Tables']['recap']['Row'];
