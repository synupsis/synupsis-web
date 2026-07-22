<template>
  <router-link
    to="/"
    :class="[
      'inline-flex shrink-0 items-center transition-opacity hover:opacity-80',
      logoClasses.container,
    ]"
  >
    <ClientOnly>
      <img
        :src="logoWhiteUrl"
        :alt="displayText ? '' : 'Synupsis'"
        :class="logoClasses.icon"
      />
      <img
        v-if="displayText"
        :src="logoTextUrl"
        alt="Synupsis"
        :class="logoClasses.wordmark"
      />
    </ClientOnly>
  </router-link>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import logoWhiteUrl from '~/assets/svg/logo_white.svg';
import logoTextUrl from '~/assets/svg/logo_text.svg';

const props = withDefaults(defineProps<{
  displayText?: boolean;
  size?: 'sm' | 'base' | 'xl';
}>(), {
  displayText: false,
  size: 'base',
});

const sizeClasses = {
  sm: {
    container: 'gap-2',
    icon: 'size-8',
    wordmark: 'h-4 w-auto',
  },
  base: {
    container: 'gap-3',
    icon: 'size-12',
    wordmark: 'h-9 w-auto',
  },
  xl: {
    container: 'gap-4',
    icon: 'size-16',
    wordmark: 'h-9 w-auto',
  },
} as const;

const logoClasses = computed(() => sizeClasses[props.size]);
</script>
