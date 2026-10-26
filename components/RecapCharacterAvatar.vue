<template>
  <span class="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold" aria-hidden="true">
    <img
      v-if="character?.imageUrl && !failed"
      :src="character.imageUrl"
      alt=""
      loading="lazy"
      class="h-full w-full object-cover object-top"
      :class="{ grayscale: muted }"
      @error="failed = true"
    >
    <template v-else>{{ character?.initials ?? '—' }}</template>
  </span>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { RecapSlideCharacter } from '~/types/recap-story.types';

// Size and colors come from the caller's classes; a missing portrait falls back to the initials.
defineProps<{
  character: RecapSlideCharacter | null;
  // Characters who died during the season are shown in black and white.
  muted?: boolean;
}>();

const failed = ref(false);
</script>
