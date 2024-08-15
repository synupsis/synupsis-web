<template>
  <div>
    <NuxtPage />
  </div>
</template>

<script lang='ts' setup>
import { provideUseId } from '@headlessui/vue';

provideUseId(() => useId().replace(/[-:]/, '_'));
</script>
