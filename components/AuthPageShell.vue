<template>
  <div class="relative isolate flex flex-col bg-background text-foreground">
    <div v-if="spotlight" aria-hidden="true" class="absolute inset-0 -z-10 overflow-hidden">
      <img :src="proxiedImageUrl(spotlight.backdrop)" alt="" decoding="async" class="h-full w-full object-cover object-[center_25%]" />
      <div class="absolute inset-0 bg-background/75" />
      <div class="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
    </div>

    <AppHeader>
      <template #account>
        <NuxtLink
          :to="alternateTo"
          class="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {{ alternateLabel }}
        </NuxtLink>
      </template>
    </AppHeader>

    <main class="flex flex-1 items-center justify-center px-5 py-12 sm:px-8 sm:py-20">
      <section aria-labelledby="auth-heading" class="w-full max-w-sm">
        <h1 id="auth-heading" class="mb-8 text-center text-3xl font-bold tracking-tight">{{ title }}</h1>
        <slot />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { proxiedImageUrl } from '~/lib/image-url';
import type { TraktShowCard } from '~/types/trakt.types';

defineProps<{
  title: string;
  alternateLabel: string;
  alternateTo: string;
}>();

// Same artwork as the home page, so signing in stays in the world of the shows.
const { data: trendingShows } = useFetch<TraktShowCard[]>('/api/shows/trending', { key: 'trending-shows' });
const spotlight = computed(() => trendingShows.value?.find(show => show.backdrop));
</script>
