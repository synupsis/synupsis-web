<template>
  <!-- A portrait card: the character's picture, with their name and actor over its foot. -->
  <figure class="relative aspect-[3/4] overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
    <img
      v-if="imageSrc"
      :src="imageSrc"
      alt=""
      class="absolute inset-0 h-full w-full object-cover object-top"
      loading="lazy"
      @error="imageLoadFailed = true"
    >
    <span v-else class="absolute inset-0 grid place-items-center bg-gradient-to-b from-primary/20 to-primary/5 text-3xl font-bold text-primary/80" aria-hidden="true">
      {{ initials }}
    </span>
    <div class="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/45 to-transparent" aria-hidden="true" />
    <figcaption class="absolute inset-x-0 bottom-0 p-3">
      <span class="line-clamp-2 text-sm font-semibold leading-tight text-white sm:text-[15px]">{{ profile.name }}</span>
      <span v-if="profile.actorName" class="mt-0.5 block truncate text-xs text-white/65">{{ profile.actorName }}</span>
    </figcaption>
  </figure>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { proxiedImageUrl } from '~/lib/image-url';
import { nameInitials } from '~/lib/utils';
import type { ShowCharacterProfile } from '~/types/show-character.types';

const props = defineProps<{
  profile: ShowCharacterProfile;
}>();

const imageLoadFailed = ref(false);
const initials = computed(() => nameInitials(props.profile.name));
const imageSrc = computed(() => (imageLoadFailed.value ? '' : proxiedImageUrl(props.profile?.imageUrl)));

watch(() => props.profile.imageUrl, () => {
  imageLoadFailed.value = false;
});
</script>
