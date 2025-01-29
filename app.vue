<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLoadingIndicator />
    <NuxtPage />
  </div>
</template>

<script lang="ts" setup>
useHead({
  htmlAttrs: {
    'data-theme': 'night',
    class: 'dark'
  }
});
provideHeadlessUseId(() => useId());
</script>
