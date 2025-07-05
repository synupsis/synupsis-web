<template>
  <div class="flex flex-col items-center text-center">
    <img :src="castMember.person.image?.medium ?? 'https://via.placeholder.com/150x210'" :alt="castMember.person.name" class="w-32 h-32 rounded-full object-cover mb-4" />
    <p class="font-bold text-white">{{ castMember.person.name }}</p>
    <p class="text-sm text-muted-foreground">{{ castMember.character.name }}</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  castMember: any;
}>();
</script>
