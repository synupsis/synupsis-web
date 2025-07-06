<template>
  <router-link to="/" class="flex items-center gap-4">
    <ClientOnly>
      <img :src="computedLogoUrl" alt="Synupsis Logo" :class="mainLogoClasses" />
      <img v-if="displayText" :src="computedLogoTextUrl" alt="Synupsis" :class="textLogoClasses" />
    </ClientOnly>
  </router-link>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import logoDarkUrl from '~/assets/svg/logo_dark.svg';
import logoWhiteUrl from '~/assets/svg/logo_white.svg';
import logoTextUrl from '~/assets/svg/logo_text.svg';

const props = withDefaults(defineProps<{
  variant?: 'dark' | 'white';
  displayText?: boolean;
  size?: 'sm' | 'base' | 'xl';
}>(), {
  variant: 'dark',
  displayText: false,
  size: 'base',
});

const computedLogoUrl = computed(() => {
  return props.variant === 'white' ? logoWhiteUrl : logoDarkUrl;
});

const computedLogoTextUrl = computed(() => {
  return logoTextUrl;
});

const mainLogoClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'h-12 w-auto';
    case 'xl':
      return 'h-20 w-auto';
    case 'base':
    default:
      return 'h-16 w-auto';
  }
});

const textLogoClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'h-8 w-auto';
    case 'xl':
      return 'h-12 w-auto';
    case 'base':
    default:
      return 'h-10 w-auto';
  }
});
</script>