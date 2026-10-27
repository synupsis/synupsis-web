<template>
  <div
    ref="root"
    :class="['blur-reveal', { 'is-visible': visible }]"
    :style="{
      '--blur-reveal-duration': `${duration}s`,
      '--blur-reveal-blur': blur,
      '--blur-reveal-offset': `${yOffset}px`
    }"
  >
    <slot />
  </div>
</template>

<script lang="ts" setup>
import { useIntersectionObserver } from '@vueuse/core';

withDefaults(
  defineProps<{
    duration?: number;
    blur?: string;
    yOffset?: number;
  }>(),
  {
    duration: 1,
    blur: '20px',
    yOffset: 20
  }
);

const root = ref<HTMLElement | null>(null);
const visible = ref(false);

// Reveal once, the first time the element scrolls into view.
const { stop } = useIntersectionObserver(root, ([entry]) => {
  if (entry?.isIntersecting) {
    visible.value = true;
    stop();
  }
});
</script>

<style scoped>
.blur-reveal {
  opacity: 0;
  filter: blur(var(--blur-reveal-blur));
  transform: translateY(var(--blur-reveal-offset));
  transition:
    opacity var(--blur-reveal-duration) ease-in-out,
    filter var(--blur-reveal-duration) ease-in-out,
    transform var(--blur-reveal-duration) ease-in-out;
}

.blur-reveal.is-visible {
  opacity: 1;
  filter: blur(0);
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .blur-reveal {
    filter: none;
    transform: none;
    transition: opacity 0.2s linear;
  }
}
</style>
