<template>
  <button
    type="button"
    class="group flex w-20 shrink-0 flex-col items-center gap-2 text-center focus-visible:outline-none"
    :aria-label="`Afficher les événements de ${profile.name} dans la timeline`"
    @click="$emit('select')"
  >
    <span class="rounded-full border border-white/10 p-1 transition-colors group-hover:border-primary/50 group-focus-visible:border-primary group-focus-visible:ring-2 group-focus-visible:ring-primary/40">
      <span class="relative grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-primary/15 text-sm font-black text-primary">
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
    </span>
    <span class="line-clamp-2 w-full text-[11px] font-medium leading-4 text-white/75 transition-colors group-hover:text-white">
      {{ profile.name }}
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

watch(() => props.profile.imageUrl, () => {
  imageLoadFailed.value = false;
});
</script>
