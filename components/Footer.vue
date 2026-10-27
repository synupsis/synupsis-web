<template>
  <footer class="border-t border-border/60 bg-background">
    <div class="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:px-8">
      <div class="space-y-3">
        <Logo display-text size="md" />
        <p class="text-xs leading-relaxed text-muted-foreground">&copy; {{ new Date().getFullYear() }} Synupsis. All rights reserved.</p>
      </div>
      <nav aria-label="Footer" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:gap-x-6">
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
</script>
