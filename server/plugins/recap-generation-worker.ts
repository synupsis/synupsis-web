import { createClient } from '@supabase/supabase-js';
import type { Database } from '~/types/database.types';
import { advanceActiveRecapGenerationJobs } from '~/server/services/recap-generation-runner';

// Advances the running recap generations from the server, so a recap keeps
// progressing when its page is refreshed or closed. The OpenAI streams already
// require a long-lived server process. Set RECAP_GENERATION_WORKER=false to
// leave the advance to browser polls.
const WORKER_INTERVAL_MS = 4_000;

export default defineNitroPlugin((nitroApp) => {
  if (process.env.RECAP_GENERATION_WORKER === 'false') return;

  const config = useRuntimeConfig();
  const url = config.public.supabase.url;
  const serverKey = config.supabase.secretKey || config.supabase.serviceKey;
  if (!url || !serverKey) {
    console.warn('The recap generation worker is off: the Supabase server key is missing.');
    return;
  }

  const service = createClient<Database>(url, serverKey, {
    auth: { detectSessionInUrl: false, persistSession: false, autoRefreshToken: false },
  });

  let ticking = false;
  const timer = setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      await advanceActiveRecapGenerationJobs(service);
    } catch (cause) {
      console.error('The recap generation worker failed to advance the running jobs:', cause);
    } finally {
      ticking = false;
    }
  }, WORKER_INTERVAL_MS);
  timer.unref?.();

  nitroApp.hooks.hook('close', () => clearInterval(timer));
});
