<template>
  <header>
    <div
      :class="[
        'relative flex w-full items-center justify-between',
        compact ? 'h-16' : 'px-4 py-6 sm:px-8',
        contained ? 'mx-auto max-w-7xl px-5 lg:px-8' : '',
      ]"
    >
      <NuxtLink
        to="/"
        aria-label="Accueil"
        class="relative z-10 shrink-0 transition-opacity hover:opacity-80"
      >
        <img
          src="/svg/logo_white.svg"
          alt=""
          :class="compact ? 'size-8' : 'size-10 sm:size-12'"
        />
      </NuxtLink>

      <NuxtLink
        to="/"
        class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity hover:opacity-80"
      >
        <img
          src="/svg/logo_text.svg"
          alt="Synupsis"
          :class="compact ? 'h-5 w-auto sm:h-6' : 'h-7 w-auto sm:h-9'"
        />
      </NuxtLink>

      <div class="relative z-10 ml-auto">
        <UserAuthStatus />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  compact?: boolean;
  contained?: boolean;
}>(), {
  compact: false,
  contained: false,
});
</script>
