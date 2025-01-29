<template>
  <div class="relative">
    <slot />
    <Ripple />
  </div>
</template>
<script lang="ts" setup>
import Ripple from '~/components/ui/Ripple.vue';
</script>
