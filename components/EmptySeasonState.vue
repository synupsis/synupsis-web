<template>
  <div class="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-10 text-center">
    <LockClosedIcon class="mx-auto h-6 w-6 text-muted-foreground" />
    <p class="mt-3 text-sm text-muted-foreground">Ces informations apparaîtront à mesure que vous avancez dans la saison.</p>
  </div>
</template>

<script setup lang="ts">
import { LockClosedIcon } from '@heroicons/vue/24/outline';
</script>
