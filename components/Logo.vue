<template>
  <router-link to="/" class="flex items-center gap-4">
    <ClientOnly>
      <img :src="logoUrl" alt="Synupsis Logo" class="h-16 w-auto" />
      <img :src="logoTextUrl" alt="Synupsis" class="h-10 w-auto" />
    </ClientOnly>
  </router-link>
</template>

<script setup lang="ts">
import logoUrl from '~/assets/svg/logo_dark.svg';
import logoTextUrl from '~/assets/svg/logo_text.svg';
</script>