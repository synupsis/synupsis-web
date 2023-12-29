import type { MergeDeep } from 'type-fest';
import type { Database as DatabaseGenerated } from './database-generated.types';

export type { Json } from './database-generated.types';

// Override the type for a specific column in a view:
export type Database = MergeDeep<DatabaseGenerated, {
  public: {
    Views: {
      movies_view: {
        Row: {
          // id is a primary key in public.movies, so it must be `not null`
          id: number
        }
      }
    }
  }
}>

export type Show = Database['public']['Tables']['show']['Row'];
export type Season = Database['public']['Tables']['season']['Row'];
