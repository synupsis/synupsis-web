<template>
  <button
    type="button"
    class="flex shrink-0 flex-col items-center gap-0.5 rounded-full px-2.5 py-1.5 text-xs font-semibold tabular-nums transition-colors disabled:cursor-default"
    :class="suggestion.liked ? 'text-rose-400' : 'text-white/45 enabled:hover:text-white'"
    :disabled="suggestion.isMine"
    :aria-pressed="suggestion.liked"
    :aria-label="suggestion.isMine
      ? t('Your suggestion · {count} likes', { count: suggestion.likeCount })
      : t('Like this suggestion · {count}', { count: suggestion.likeCount })"
    @click="emit('like')"
  >
    <HeartIcon
      :key="String(suggestion.liked)"
      class="h-[22px] w-[22px]"
      :class="{ 'heart-pop fill-current': suggestion.liked }"
      aria-hidden="true"
    />
    <span aria-hidden="true">{{ suggestion.likeCount }}</span>
  </button>
</template>

<script setup lang="ts">
import { HeartIcon } from 'lucide-vue-next';
import type { RecapSlideSuggestion } from '~/types/recap-slide-suggestion.types';

const { t } = useI18n();

defineProps<{
  suggestion: RecapSlideSuggestion;
}>();

const emit = defineEmits<{
  like: [];
}>();
</script>

<style scoped>
.heart-pop { animation: heart-pop 320ms cubic-bezier(0.22, 1, 0.36, 1); }
@keyframes heart-pop {
  0% { transform: scale(0.6); }
  55% { transform: scale(1.25); }
  100% { transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .heart-pop { animation: none; }
}
</style>
