import { ref } from 'vue';
import type { LanguagePreference } from '~/lib/i18n/locale';

export function useLanguagePreference() {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();
  const saving = ref(false);

  async function saveLanguagePreference(preference: LanguagePreference) {
    if (saving.value) return false;
    if (!user.value) throw new Error('Sign in to change your language.');
    if (!['en', 'fr', 'browser'].includes(preference)) throw new Error('Unsupported language.');
    const userId = user.value.sub;
    saving.value = true;
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { display_language: preference === 'browser' ? null : preference },
      });
      if (error) throw error;
      if (!data.user || data.user.id !== userId || user.value?.sub !== userId) return false;
      // Keep all other account metadata intact and apply only a successful save.
      user.value = { ...user.value, user_metadata: data.user.user_metadata };
      // Refresh the claims used by Nuxt during subsequent server rendering.
      // The preference is already saved if the network drops during this step.
      await supabase.auth.refreshSession().catch(() => undefined);
      return true;
    } finally {
      saving.value = false;
    }
  }

  return { saving, saveLanguagePreference };
}
