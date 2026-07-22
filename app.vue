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
  link: [
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Inter:wght@400;500;600;700&display=swap'
    }
  ],
  htmlAttrs: {
    'data-theme': 'night',
    class: 'dark'
  }
});
provideHeadlessUseId(() => useId());
</script>
