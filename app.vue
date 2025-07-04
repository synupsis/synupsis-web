<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLoadingIndicator />
    <NuxtPage />
    <Toaster position="top-center" />
  </div>
</template>

<script lang="ts" setup>
import { Toaster } from '~/components/shadcn/sonner'
import 'vue-sonner/style.css'

useHead({
  htmlAttrs: {
    'data-theme': 'night',
    class: 'dark'
  }
});
provideHeadlessUseId(() => useId());
</script>
