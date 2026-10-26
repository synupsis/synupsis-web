<script setup lang="ts">
const route = useRoute();
await navigateTo({
  path: `/shows/${route.params.slug}`,
  query: {
    ...route.query,
    season: String(route.params.number),
  },
}, { replace: true });
</script>

<template>
  <div />
</template>
