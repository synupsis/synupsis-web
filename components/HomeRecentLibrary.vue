<template>
  <section class="mb-10 border-t border-border pt-8 sm:mb-14" aria-labelledby="recent-library-heading" :aria-busy="loading">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 id="recent-library-heading" class="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
        <LibraryBig class="size-5 shrink-0 text-violet-500 dark:text-violet-300" aria-hidden="true" />
        {{ t('My shows') }}
      </h2>
      <NuxtLink to="/library" class="inline-flex items-center gap-1.5 rounded text-sm font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
        {{ t('View library') }} <ArrowRight class="size-4" aria-hidden="true" />
      </NuxtLink>
    </div>

    <div v-if="loading" role="status" :aria-label="t('Loading your library')" class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-5">
      <div v-for="i in 5" :key="i" aria-hidden="true" class="motion-safe:animate-pulse">
        <div class="aspect-video rounded-xl bg-muted" />
        <div class="mt-3 h-4 w-3/4 rounded bg-muted" />
        <div class="mt-2 h-3 w-1/2 rounded bg-muted" />
      </div>
    </div>
    <div v-else-if="error" class="rounded-2xl border border-border px-6 py-8 text-center text-sm text-muted-foreground" role="status">
      <p>{{ t('Could not load your library.') }}</p>
      <button type="button" class="mt-4 rounded-lg border border-border px-4 py-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" @click="refresh()">{{ t('Try again') }}</button>
    </div>
    <ul v-else-if="entries.length" class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-5">
      <li v-for="entry in entries" :key="entry.slug" class="min-w-0">
        <NuxtLink :to="`/shows/${entry.slug}`" class="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-4 focus-visible:ring-offset-background">
          <div class="relative aspect-video overflow-hidden rounded-xl bg-muted">
            <img
              v-if="entry.image && !failedImages.has(entry.slug)"
              :src="proxiedImageUrl(entry.image)"
              alt=""
              loading="lazy"
              decoding="async"
              class="h-full w-full object-cover transition duration-300 group-hover:scale-105 motion-reduce:transform-none"
              @error="failedImages.add(entry.slug)"
            />
            <div v-else class="grid h-full place-items-center text-muted-foreground"><Tv class="size-8 opacity-50" aria-hidden="true" /></div>
          </div>
          <div class="mt-3 flex items-baseline justify-between gap-2">
            <h3 :title="entry.name" class="min-w-0 flex-1 truncate text-sm font-semibold leading-snug transition group-hover:text-violet-500 sm:text-base dark:group-hover:text-violet-300">{{ entry.name }}</h3>
            <span v-if="entry.season && entry.episode > 0" class="shrink-0 text-xs text-muted-foreground tabular-nums sm:text-sm">
              {{ `S${String(entry.season).padStart(2, '0')}E${String(entry.episode).padStart(2, '0')}` }}
            </span>
          </div>
        </NuxtLink>
      </li>
    </ul>
    <div v-else class="rounded-2xl border border-dashed border-border px-6 py-8 text-center">
      <h3 class="text-sm font-semibold">{{ t('Start your library') }}</h3>
      <p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{{ t('Open a series and add it to your library, or track it episode by episode.') }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ArrowRight, LibraryBig, Tv } from 'lucide-vue-next';
import { proxiedImageUrl } from '~/lib/image-url';
import type { LibraryListEntry } from '~/types/library.types';

// The parent remounts this component for each signed-in user.
const props = defineProps<{ userId: string }>();
const { t } = useI18n();
const { data, status, error, refresh, clear } = useFetch<{ entries: LibraryListEntry[] }>('/api/home/library', {
  key: `home-recent-library:${props.userId}`,
  lazy: true,
  // Hydrate the server result, but fetch fresh additions when coming back home.
  getCachedData: (key, nuxtApp) => nuxtApp.isHydrating ? nuxtApp.payload.data[key] : undefined,
});
const entries = computed(() => data.value?.entries ?? []);
const loading = computed(() => status.value === 'idle' || status.value === 'pending');
const failedImages = reactive(new Set<string>());

// Clear private data and cancel pending requests on navigation or sign-out.
onBeforeUnmount(() => clear());
</script>
