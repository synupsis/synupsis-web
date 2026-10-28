<template>
  <footer class="bg-background" :class="{ 'border-t border-border/60': !compact }">
    <div
      class="mx-auto flex max-w-7xl flex-col px-5 sm:px-8"
      :class="compact
        ? 'items-center gap-1 pb-5 pt-3 text-center sm:flex-row sm:justify-between sm:gap-6 sm:py-5'
        : 'gap-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:gap-8'"
    >
      <div :class="compact ? 'order-2 sm:order-1' : 'space-y-3'">
        <Logo v-if="!compact" display-text size="md" />
        <p class="text-xs leading-relaxed text-muted-foreground">&copy; {{ new Date().getFullYear() }} Synupsis.<template v-if="!compact"> All rights reserved.</template></p>
      </div>
      <nav
        aria-label="Footer"
        class="flex flex-wrap items-center gap-y-1"
        :class="compact ? 'order-1 justify-center gap-x-5 text-xs sm:order-2' : 'gap-x-3 text-sm sm:gap-x-6'"
      >
        <NuxtLink to="/about" class="inline-flex min-h-11 items-center rounded-md text-muted-foreground transition-colors hover:text-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-4 focus-visible:ring-offset-background">
          About
        </NuxtLink>
        <a href="#" class="inline-flex min-h-11 items-center rounded-md text-muted-foreground transition-colors hover:text-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-4 focus-visible:ring-offset-background">Terms of Service</a>
        <a href="#" class="inline-flex min-h-11 items-center rounded-md text-muted-foreground transition-colors hover:text-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-4 focus-visible:ring-offset-background">Privacy Policy</a>
      </nav>
    </div>
  </footer>
</template>

<script setup lang="ts">
import Logo from '~/components/Logo.vue';

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
</script>
