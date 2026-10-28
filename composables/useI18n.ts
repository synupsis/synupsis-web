import { computed } from 'vue';
import type { Session } from '@supabase/supabase-js';
import { getLanguagePreference, getRequestLocale, translate, type DisplayLocale, type TranslationParams } from '~/lib/i18n/locale';
import { frenchMessages } from '~/lib/i18n/messages';

export function useI18n() {
  // Nuxt serializes this request-specific state, keeping hydration in the same
  // language as the server. app.vue refines it from navigator after mounting.
  const headers = useRequestHeaders(['accept-language']);
  const browserLocale = useState<DisplayLocale>('display-browser-locale', () => getRequestLocale(headers['accept-language']));
  const user = useSupabaseUser();
  const session = useSupabaseSession();
  const preference = computed(() => {
    if (!user.value) return 'browser';
    // updateUser updates session.user before a refreshed JWT is available.
    // Nuxt omits user from the SSR session type; the browser session has it.
    const sessionUser = (session.value as Partial<Session> | null)?.user;
    const metadata = sessionUser?.id === user.value.sub
      ? sessionUser.user_metadata
      : user.value.user_metadata;
    return getLanguagePreference(metadata?.display_language);
  });
  const locale = computed<DisplayLocale>(() => preference.value === 'browser' ? browserLocale.value : preference.value);
  const t = (message: string, params?: TranslationParams) => translate(message, locale.value, frenchMessages, params);
  return { t, locale, preference, browserLocale };
}
