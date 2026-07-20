<template>
  <div class="flex flex-col items-center text-center">
    <cached-image :src="headshotUrl" :alt="castMember.person.name" class="w-32 h-32 rounded-full object-cover mb-4" />
    <p class="font-bold text-white">{{ castMember.person.name }}</p>
    <p class="text-sm text-muted-foreground">{{ castMember.character }}</p>
  </div>
</template>

<script setup lang="ts">
import placeholderUrl from '~/assets/images/placeholder.svg';

const props = defineProps<{
  castMember: any;
}>();

const headshotUrl = computed(() => {
  const headshot = props.castMember?.images?.headshot?.[0];
  if (!headshot) return placeholderUrl;
  return headshot.startsWith('http') ? headshot : `https://${headshot}`;
});
</script>
