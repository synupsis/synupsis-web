<template>
  <div class="min-h-screen w-full bg-background text-foreground">
    <AppHeader class="border-b" />
    <main class="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
      <h1 class="text-3xl font-black tracking-tight sm:text-4xl">{{ t('Library') }}</h1>
      <p class="mt-2 text-sm text-muted-foreground">{{ t('The series you saved, and where you are in the ones you track.') }}</p>

      <div v-if="pending" class="grid h-60 place-items-center"><SpinLoader class="h-8 w-8" /></div>
      <p v-else-if="error" class="mt-12 text-center text-destructive">{{ t('Could not load your library.') }}</p>
      <div v-else-if="!entries.length" class="mt-10 rounded-2xl border border-dashed border-white/15 p-10 text-center">
        <BookmarkIcon class="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h2 class="mt-4 text-lg font-semibold">{{ t('Start your library') }}</h2>
        <p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{{ t('Open a series and add it to your library, or track it episode by episode.') }}</p>
        <Button as-child class="mt-6 rounded-full"><NuxtLink to="/">{{ t('Find a series') }}</NuxtLink></Button>
      </div>

      <template v-else>
        <section v-for="section in sections" :key="section.key" class="mt-10">
          <h2 class="text-lg font-semibold">{{ section.title }} <span class="ml-1 text-sm font-normal text-muted-foreground tabular-nums">{{ section.entries.length }}</span></h2>
          <ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <li v-for="entry in section.entries" :key="entry.slug">
              <NuxtLink
                :to="entryLink(entry)"
                class="group block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] outline-none transition-colors hover:border-white/25 focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <div class="relative aspect-video bg-muted">
                  <img
                    v-if="entry.image && !failedImages.has(entry.slug)"
                    :src="proxiedImageUrl(entry.image)"
                    alt=""
                    loading="lazy"
                    decoding="async"
                    class="h-full w-full object-cover transition duration-300 group-hover:scale-105 motion-reduce:transition-none"
                    @error="failedImages.add(entry.slug)"
                  />
                  <div v-else class="grid h-full place-items-center text-muted-foreground"><TvIcon class="h-8 w-8 opacity-50" aria-hidden="true" /></div>
                </div>
                <div class="flex items-center gap-3 p-4">
                  <div class="min-w-0 flex-1">
                    <h3 class="truncate font-semibold">{{ entry.name }}</h3>
                    <p class="mt-0.5 text-sm text-muted-foreground tabular-nums">
                      {{ entry.season
                        ? (entry.episode ? t('Watched up to S{season}E{episode}', { season: entry.season, episode: entry.episode }) : t('Starting season {number}', { number: entry.season }))
                        : t('Not tracked') }}
                    </p>
                  </div>
                  <span v-if="entry.season" class="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary">
                    <PlayIcon class="h-3.5 w-3.5" aria-hidden="true" />
                    {{ t('Resume') }}
                  </span>
                </div>
              </NuxtLink>
            </li>
          </ul>
        </section>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { BookmarkIcon, PlayIcon, TvIcon } from 'lucide-vue-next';
import { computed, reactive } from 'vue';
import type { LibraryListEntry } from '~/types/library.types';
import { Button } from '~/components/shadcn/button';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import { proxiedImageUrl } from '~/lib/image-url';

const { t } = useI18n();
useHead(() => ({ title: t('Library — Synupsis') }));

const { data, pending, error } = await useFetch<{ entries: LibraryListEntry[] }>('/api/library');
const entries = computed(() => data.value?.entries ?? []);
const sections = computed(() => [
  { key: 'tracking', title: t('Watching'), entries: entries.value.filter(entry => entry.season) },
  { key: 'saved', title: t('Saved series'), entries: entries.value.filter(entry => !entry.season) },
].filter(section => section.entries.length));
const failedImages = reactive(new Set<string>());

// The show page opens at the saved progress on its own.
function entryLink(entry: LibraryListEntry) {
  return `/shows/${entry.slug}`;
}
</script>
