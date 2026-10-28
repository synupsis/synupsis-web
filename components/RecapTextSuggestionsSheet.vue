<template>
  <!-- What people proposed for one text of the slide: it rises from the bottom of the story. -->
  <Transition name="sheet-backdrop">
    <div
      v-if="open"
      class="absolute inset-0 z-40 bg-black/45"
      aria-hidden="true"
      @click="emit('close')"
    />
  </Transition>
  <Transition name="sheet">
    <section
      v-if="open"
      ref="sheetElement"
      role="dialog"
      :aria-label="t('Suggestions for this text')"
      class="absolute inset-x-0 bottom-0 z-50 flex max-h-[75%] flex-col rounded-t-[28px] bg-neutral-900/95 text-white shadow-[0_-12px_40px_rgb(0_0_0/0.45)] backdrop-blur-xl"
      :style="dragStyle"
      @mousedown.stop
      @mouseup.stop
      @touchstart.stop
      @touchend.stop
      @click.stop
    >
      <!-- The handle: pulled down, the sheet goes away. -->
      <div
        class="flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-3 active:cursor-grabbing"
        @pointerdown="startDrag"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
      >
        <span class="h-1 w-10 rounded-full bg-white/25" />
      </div>

      <header class="shrink-0 px-6 pb-4">
        <p class="text-[13px] text-white/50">
          {{ suggestions.length > 1 ? t('{count} proposed versions', { count: suggestions.length }) : t('{count} proposed version', { count: suggestions.length }) }}
        </p>
        <p class="mt-1.5 line-clamp-2 text-[15px] leading-snug text-white/70">“{{ text }}”</p>
      </header>

      <ul class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 [scrollbar-width:none]">
        <TransitionGroup name="suggestion-row">
          <li v-for="suggestion in suggestions" :key="suggestion.id" class="px-3">
            <RecapSuggestionItem :suggestion="suggestion" @like="emit('like', suggestion)" />
          </li>
        </TransitionGroup>
      </ul>

      <footer class="shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          class="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-neutral-900 transition-transform active:scale-[0.98]"
          @click="emit('propose')"
        >
          <PencilIcon class="h-4 w-4" aria-hidden="true" />
          {{ t('Suggest my version') }}
        </button>
      </footer>
    </section>
  </Transition>
</template>

<script setup lang="ts">
import { PencilIcon } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import RecapSuggestionItem from '~/components/RecapSuggestionItem.vue';
import type { RecapSlideSuggestion } from '~/types/recap-slide-suggestion.types';

const { t } = useI18n();

const props = defineProps<{
  open: boolean;
  // The text as the slide shows it, and its suggestions, the most liked first.
  text: string;
  suggestions: RecapSlideSuggestion[];
}>();

const emit = defineEmits<{
  close: [];
  like: [suggestion: RecapSlideSuggestion];
  propose: [];
}>();

// Pulled down by its handle past this distance, the sheet closes.
const DISMISS_DISTANCE_PX = 90;
const dragOffset = ref(0);
const isDragging = ref(false);
let dragStart: number | null = null;

const dragStyle = computed(() => (dragOffset.value
  ? { transform: `translateY(${dragOffset.value}px)`, transition: isDragging.value ? 'none' : undefined }
  : undefined));

function startDrag(event: PointerEvent) {
  dragStart = event.clientY;
  isDragging.value = true;
  try {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  } catch {
    // The pointer is already gone: the drag simply follows the handle.
  }
}

function moveDrag(event: PointerEvent) {
  if (dragStart !== null) dragOffset.value = Math.max(0, event.clientY - dragStart);
}

function endDrag() {
  if (dragStart === null) return;
  dragStart = null;
  isDragging.value = false;
  if (dragOffset.value > DISMISS_DISTANCE_PX) emit('close');
  else dragOffset.value = 0;
}

watch(() => props.open, () => {
  dragOffset.value = 0;
});
</script>

<style scoped>
.sheet-enter-active,
.sheet-leave-active { transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1); }
.sheet-enter-from,
.sheet-leave-to { transform: translateY(100%) !important; }

.sheet-backdrop-enter-active,
.sheet-backdrop-leave-active { transition: opacity 240ms ease-out; }
.sheet-backdrop-enter-from,
.sheet-backdrop-leave-to { opacity: 0; }

/* A like may reorder the list: rows glide to their new place. */
.suggestion-row-move { transition: transform 300ms cubic-bezier(0.22, 1, 0.36, 1); }

@media (prefers-reduced-motion: reduce) {
  .sheet-enter-active,
  .sheet-leave-active,
  .suggestion-row-move { transition: none; }
}
</style>
