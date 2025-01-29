import { createClient } from '@supabase/supabase-js';
import type { Database } from '~/types/database.types';

let supabaseInstance: ReturnType<typeof createClient<Database>> | null = null;

export default function useSupabase() {
  if (!supabaseInstance) {
    const config = useRuntimeConfig();
    supabaseInstance = createClient<Database>(
      config.public.supabaseUrl,
      config.public.supabaseAnonKey
    );
  }
  return supabaseInstance;
}
