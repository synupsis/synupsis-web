<template>
  <div class="flex flex-col min-h-screen">
    <NuxtRouteAnnouncer />
    <NuxtLoadingIndicator />
    <NuxtPage class="flex-grow" />
    <Footer />
    <Toaster position="top-center" />
  </div>
</template>

<script lang="ts" setup>
import { Toaster } from '~/components/shadcn/sonner'
import 'vue-sonner/style.css'
import Footer from '~/components/Footer.vue'

useHead({
  htmlAttrs: {
    'data-theme': 'night',
    class: 'dark'
  }
});
provideHeadlessUseId(() => useId());
</script>
