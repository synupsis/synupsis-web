import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue';
import { toast } from 'vue-sonner';
import type { RecapSlideSuggestion, RecapSlideSuggestionInput } from '~/types/recap-slide-suggestion.types';
import { compareSuggestions } from '~/lib/recap-suggestion-order';

/** Everyone's suggestions on one recap, with the viewer's likes; the most liked first. */
export function useRecapSuggestions(recapId: MaybeRefOrGetter<string>) {
  const { t } = useI18n();
  const user = useSupabaseUser();
  const route = useRoute();
  const suggestions = ref<RecapSlideSuggestion[]>([]);
  const loading = ref(false);
  const loaded = ref(false);

  /** A quiet load (in the background of a story) fails without a message. */
  async function load({ quiet = false } = {}) {
    loading.value = true;
    try {
      suggestions.value = await $fetch<RecapSlideSuggestion[]>(`/api/recap/${toValue(recapId)}/suggestions`);
      loaded.value = true;
    } catch {
      if (!quiet) toast.error(t('Could not load the suggestions.'));
    } finally {
      loading.value = false;
    }
  }

  function requireAccount() {
    if (user.value) return true;
    toast.info(t('Sign in to suggest corrections and like suggestions.'));
    navigateTo({ path: '/login', query: { redirect: route.fullPath } });
    return false;
  }

  function upsert(suggestion: RecapSlideSuggestion) {
    suggestions.value = [...suggestions.value.filter(item => item.id !== suggestion.id), suggestion].sort(compareSuggestions);
  }

  /** Sends a suggestion; the same text correction made earlier gets a like instead. */
  async function submit(input: RecapSlideSuggestionInput): Promise<RecapSlideSuggestion | null> {
    if (!requireAccount()) return null;
    try {
      const { suggestion, duplicate } = await $fetch<{ suggestion: RecapSlideSuggestion; duplicate: boolean }>(
        `/api/recap/${toValue(recapId)}/suggestions`,
        { method: 'POST', body: input },
      );
      upsert(suggestion);
      toast.success(duplicate
        ? t('Someone already suggested this: your like was added to it.')
        : t('Your suggestion has been sent.'));
      return suggestion;
    } catch (cause: any) {
      toast.error(t('Could not send the suggestion.'), { description: cause.data?.statusMessage || cause.message });
      return null;
    }
  }

  async function toggleLike(suggestion: RecapSlideSuggestion) {
    if (!requireAccount() || suggestion.isMine) return;
    const active = !suggestion.liked;
    // The count follows at once and comes back if the save fails.
    upsert({ ...suggestion, liked: active, likeCount: suggestion.likeCount + (active ? 1 : -1) });
    try {
      await $fetch(`/api/recap-suggestions/${suggestion.id}/like`, { method: 'PUT', body: { active } });
    } catch {
      upsert(suggestion);
      toast.error(t('Could not save your like.'));
    }
  }

  function forSlide(slideOrder: number) {
    return suggestions.value.filter(suggestion => suggestion.slideOrder === slideOrder);
  }

  /** How many suggestions each text of a slide has, by its path in the content. */
  function countsByPath(slideOrder: number): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const suggestion of forSlide(slideOrder)) {
      if (suggestion.fieldPath) counts[suggestion.fieldPath] = (counts[suggestion.fieldPath] ?? 0) + 1;
    }
    return counts;
  }

  const countBySlide = computed(() => {
    const counts = new Map<number, number>();
    for (const suggestion of suggestions.value) {
      if (suggestion.kind !== 'add') counts.set(suggestion.slideOrder, (counts.get(suggestion.slideOrder) ?? 0) + 1);
    }
    return counts;
  });

  return { suggestions, loading, loaded, load, submit, toggleLike, forSlide, countsByPath, countBySlide };
}

export type RecapSuggestionStore = ReturnType<typeof useRecapSuggestions>;
