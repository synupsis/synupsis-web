import { createClient } from '@supabase/supabase-js';

export default function useSupabase() {
  const config = useRuntimeConfig();
  const supabase = createClient(config.public.supabaseUrl, config.public.supabaseAnonKey);

  return {
    supabase
  };
}
