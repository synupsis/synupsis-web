import { computed, ref } from 'vue';
import type { Session } from '@supabase/supabase-js';
import { getRecapLanguages, normalizeRecapLocale, type RecapLocale } from '~/lib/recap-locales';

export function useRecapLanguages() {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();
  const session = useSupabaseSession();
  const { locale } = useI18n();
  const saving = ref(false);

  /** The languages the user reads recaps in, first preferred; the display language until they choose. */
  const recapLanguages = computed<RecapLocale[]>(() => {
    if (!user.value) return getRecapLanguages(null, locale.value);
    // Same source as the display language: updateUser refreshes session.user first.
    const sessionUser = (session.value as Partial<Session> | null)?.user;
    const metadata = sessionUser?.id === user.value.sub
      ? sessionUser.user_metadata
      : user.value.user_metadata;
    return getRecapLanguages(metadata?.recap_languages, locale.value);
  });

  async function saveRecapLanguages(languages: RecapLocale[]) {
    if (saving.value) return false;
    if (!user.value) throw new Error('Sign in to change your recap languages.');
    const recapLanguages = [...new Set(languages.map(normalizeRecapLocale))];
    if (!recapLanguages.length || recapLanguages.some(language => !language)) throw new Error('Unsupported language.');
    const userId = user.value.sub;
    saving.value = true;
    try {
      const { data, error } = await supabase.auth.updateUser({ data: { recap_languages: recapLanguages } });
      if (error) throw error;
      if (!data.user || data.user.id !== userId || user.value?.sub !== userId) return false;
      user.value = { ...user.value, user_metadata: data.user.user_metadata };
      await supabase.auth.refreshSession().catch(() => undefined);
      return true;
    } finally {
      saving.value = false;
    }
  }

  return { recapLanguages, saving, saveRecapLanguages };
}
