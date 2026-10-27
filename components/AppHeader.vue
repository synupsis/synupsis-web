<template>
  <header>
    <div
      :class="[
        'flex w-full items-center justify-between gap-2 px-5 sm:gap-3 sm:px-8',
        compact ? 'h-16' : 'h-20',
        contained ? 'mx-auto max-w-7xl' : '',
      ]"
    >
      <Logo
        display-text
        size="md"
        :play-on-home-arrival="animateLogoOnArrival"
        aria-label="Synupsis home"
      />

      <nav aria-label="Account" class="flex shrink-0 items-center">
        <slot name="account">
          <UserAuthStatus />
        </slot>
      </nav>
    </div>
  </header>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  compact?: boolean;
  contained?: boolean;
  animateLogoOnArrival?: boolean;
}>(), {
  compact: false,
  contained: true,
  animateLogoOnArrival: false,
});
</script>
