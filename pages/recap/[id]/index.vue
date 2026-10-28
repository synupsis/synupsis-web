<template>
  <div class="h-dvh bg-black">
    <RecapStoryPlayer ref="player" :recap-id="recapId" standalone @close="close" />
  </div>
</template>

<script lang="ts" setup>
import RecapStoryPlayer from '~/components/RecapStoryPlayer.vue';
import { loadRecapStory } from '~/composables/useStoryViewer';

// A shared link opens the story on its own; closing it leads to the show.
const route = useRoute();
const router = useRouter();
const recapId = route.params.id as string;
const player = ref<InstanceType<typeof RecapStoryPlayer> | null>(null);

async function close() {
  const [story] = await Promise.all([
    loadRecapStory(recapId).catch(() => null),
    player.value?.leave(),
  ]);
  if (story?.show.trakt_id) await router.push(`/shows/${story.show.trakt_id}`);
  else router.back();
}
</script>
