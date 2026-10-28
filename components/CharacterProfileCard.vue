<template>
  <div class="flex w-full items-center gap-4 rounded-xl border border-white/10 p-4">
    <span class="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-lg font-bold text-primary">
      <img
        v-if="imageSrc"
        :src="imageSrc"
        alt=""
        class="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        @error="imageLoadFailed = true"
      >
      <span v-else aria-hidden="true">{{ initials }}</span>
    </span>
    <span class="flex min-w-0 flex-col gap-1">
      <span class="truncate text-base font-semibold">{{ profile.name }}</span>
      <span v-if="profile.actorName" class="truncate text-[13px] text-muted-foreground">{{ profile.actorName }}</span>
    </span>
  </div>
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
