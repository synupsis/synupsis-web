<template>
  <button
    type="button"
    class="group flex w-full items-center gap-4 rounded-xl border border-white/10 p-4 text-left transition-colors hover:border-white/20 hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    :aria-label="`Afficher les scènes de ${profile.name} dans la timeline`"
    @click="$emit('select')"
  >
    <span class="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-lg font-bold text-primary">
      <img
        v-if="imageSrc"
        :src="imageSrc"
        alt=""
        class="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
        loading="lazy"
        @error="imageLoadFailed = true"
      >
      <span v-else aria-hidden="true">{{ initials }}</span>
    </span>
    <span class="flex min-w-0 flex-col gap-1">
      <span class="truncate text-base font-semibold">{{ profile.name }}</span>
      <span v-if="profile.actorName" class="truncate text-[13px] text-muted-foreground">{{ profile.actorName }}</span>
      <span v-if="lastSeenLabel" class="text-sm text-white/75">{{ lastSeenLabel }}</span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useImageUrl } from '~/composables/useUtils';
import type { TimelineCharacterProfile } from '~/types/show-character.types';

const props = defineProps<{
  profile: TimelineCharacterProfile;
}>();

defineEmits<{
  select: [];
}>();

const imageLoadFailed = ref(false);
const initials = computed(() => props.profile.name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0]?.toLocaleUpperCase())
  .join(''));
const imageSrc = computed(() => {
  const imageUrl = props.profile.imageUrl;
  if (!imageUrl || imageLoadFailed.value) return '';
  if (props.profile.imageProvider === 'tvmaze') {
    return `/api/images/proxy?url=${encodeURIComponent(imageUrl)}`;
  }
  return useImageUrl(imageUrl);
});
const lastSeenLabel = computed(() => {
  const lastSeen = props.profile.lastSeen;
  if (!lastSeen) return '';
  const scenes = `${props.profile.eventCount} scène${props.profile.eventCount > 1 ? 's' : ''}`;
  return `${scenes} · vu en S${lastSeen.seasonNumber}E${lastSeen.episodeNumber}`;
});

watch(() => props.profile.imageUrl, () => {
  imageLoadFailed.value = false;
});
</script>
