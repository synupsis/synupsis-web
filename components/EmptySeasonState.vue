<template>
  <div class="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-10 text-center">
    <LockClosedIcon class="mx-auto h-6 w-6 text-muted-foreground" />
    <p class="mt-3 text-sm text-muted-foreground">{{ t('This information will appear as you progress through the season.') }}</p>
  </div>
</template>

<script setup lang="ts">
import { LockClosedIcon } from '@heroicons/vue/24/outline';
const { t } = useI18n();

</script>
