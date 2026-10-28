<template>
  <RecapStoryPlayer
    v-if="activeId"
    :key="activeId"
    ref="player"
    :recap-id="activeId"
    @close="closeStory"
    @closed="activeId = null"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import RecapStoryPlayer from '~/components/RecapStoryPlayer.vue';
import { STORY_QUERY_KEY, useStoryViewer } from '~/composables/useStoryViewer';

// Follows `?story=<id>` on any page: the URL opens and closes the story, so the
// back button and the close button play the same animation.
const route = useRoute();
const { closeStory, forgetStoryEntry } = useStoryViewer();

const requestedId = computed(() => {
  const value = route.query[STORY_QUERY_KEY];
  return typeof value === 'string' && value ? value : null;
});

const activeId = ref<string | null>(requestedId.value);
const player = ref<InstanceType<typeof RecapStoryPlayer> | null>(null);

watch([requestedId, () => route.path], ([id], [, previousPath]) => {
  if (id) {
    activeId.value = id;
    return;
  }
  forgetStoryEntry();
  // On another page (the recap editor, say) there is nothing to shrink back
  // into: the story goes at once instead of waiting for its animation.
  if (player.value && route.path === previousPath) void player.value.leave();
  else activeId.value = null;
});
</script>
