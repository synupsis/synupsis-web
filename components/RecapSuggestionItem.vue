<template>
  <!-- One suggestion, as plainly as possible: what is proposed, who proposed it, and a heart. -->
  <article class="flex items-start gap-3 py-3.5">
    <div class="min-w-0 flex-1">
      <button
        v-if="showSlide"
        type="button"
        class="mb-1 text-xs text-white/40 transition-colors hover:text-white"
        @click="emit('open-slide')"
      >
        {{ suggestion.kind === 'add' ? t('After slide {number}', { number: suggestion.slideOrder }) : t('Slide {number}', { number: suggestion.slideOrder }) }}
      </button>
      <p class="whitespace-pre-line text-[15px] font-medium leading-snug text-white">
        {{ suggestion.kind === 'text' ? suggestion.proposedValue : suggestion.message }}
      </p>
      <p class="mt-1.5 text-xs text-white/40">
        {{ suggestion.isMine ? t('You') : suggestion.authorName || t('Anonymous') }}
        <template v-if="suggestion.kind === 'add'"> · {{ t('New slide') }}</template>
        <template v-else-if="suggestion.kind === 'change'"> · {{ t('Change') }}</template>
        <span v-if="suggestion.status !== 'pending'" :class="suggestion.status === 'accepted' ? 'text-emerald-400' : 'text-rose-400'">
          · {{ suggestion.status === 'accepted' ? t('Accepted') : t('Declined') }}
        </span>
      </p>
    </div>
    <RecapLikeButton class="-mr-1 -mt-1" :suggestion="suggestion" @like="emit('like')" />
  </article>
</template>

<script setup lang="ts">
import RecapLikeButton from '~/components/RecapLikeButton.vue';
import type { RecapSlideSuggestion } from '~/types/recap-slide-suggestion.types';

const { t } = useI18n();

defineProps<{
  suggestion: RecapSlideSuggestion;
  // In a list of the whole recap: which slide it is about, as a link to it.
  showSlide?: boolean;
}>();

const emit = defineEmits<{
  like: [];
  'open-slide': [];
}>();
</script>
