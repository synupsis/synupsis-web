<template>
  <!-- The slide is laid out at the story frame size, then scaled down: it looks exactly as in the player. -->
  <div
    class="relative overflow-hidden bg-neutral-950"
    :style="{ width: `${width}px`, height: `${Math.round(width * FRAME_HEIGHT / FRAME_WIDTH)}px` }"
    :aria-hidden="editable ? undefined : 'true'"
    :inert="!editable"
  >
    <div
      class="absolute left-0 top-0 origin-top-left"
      :class="{ 'pointer-events-none': !editable }"
      :style="{ width: `${FRAME_WIDTH}px`, height: `${FRAME_HEIGHT}px`, transform: `scale(${width / FRAME_WIDTH})` }"
    >
      <RecapStorySlide
        v-if="slide.content"
        :content="slide.content"
        :image-url="slide.image_url || null"
        :image-focus="slide.image_focus ?? null"
        :season-number="seasonNumber"
        :slide-number="slideNumber"
        :total-slides="totalSlides"
        :genres="genres"
        :has-rail="false"
        :editable="editable"
        :selected-path="selectedPath"
        :suggestion-counts="suggestionCounts"
        @select-text="emit('select-text', $event)"
        @open-suggestions="emit('open-suggestions', $event)"
      />
      <ClientOnly v-else>
        <RecapCanvas
          :model-value="JSON.stringify(slide.canvas_data)"
          :read-only="true"
          class="h-full w-full"
        />
      </ClientOnly>
    </div>
  </div>
</template>

<script setup lang="ts">
import RecapCanvas from '~/components/RecapCanvas.client.vue';
import RecapStorySlide from '~/components/RecapStorySlide.vue';
import type { RecapStoryPayload } from '~/composables/useStoryViewer';

// The story frame on a phone (see the player's aspect ratio).
const FRAME_WIDTH = 390;
const FRAME_HEIGHT = 844;

withDefaults(defineProps<{
  slide: RecapStoryPayload['slides'][number];
  seasonNumber: number;
  slideNumber: number;
  totalSlides: number;
  genres: string[];
  width?: number;
  // Texts can be picked to suggest a correction (see RecapStorySlide).
  editable?: boolean;
  selectedPath?: string | null;
  suggestionCounts?: Record<string, number>;
}>(), {
  width: 160,
  editable: false,
  selectedPath: null,
  suggestionCounts: () => ({}),
});

const emit = defineEmits<{
  'select-text': [path: string];
  'open-suggestions': [path: string];
}>();
</script>
