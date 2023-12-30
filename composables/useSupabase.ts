import { createClient } from '@supabase/supabase-js';
import type { Database } from '~/types/database.types';

export default function useSupabase() {
  const config = useRuntimeConfig();
  const supabase = createClient<Database>(config.public.supabaseUrl, config.public.supabaseAnonKey);

  return {
    supabase
  };
}
