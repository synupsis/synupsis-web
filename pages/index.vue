<template>
  <div class="min-h-screen">
    <div class="relative isolate">
      <div v-if="spotlight" aria-hidden="true" class="absolute inset-0 -z-10 overflow-hidden">
        <img :src="proxiedImageUrl(spotlight.backdrop)" alt="" decoding="async" fetchpriority="high" class="h-full w-full object-cover object-[center_25%]" />
        <div class="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-background/10" />
        <div class="absolute inset-0 bg-gradient-to-r from-background/70 via-background/20 to-transparent" />
      </div>

      <AppHeader contained animate-logo-on-arrival />

      <div :class="['mx-auto flex max-w-7xl flex-col justify-end px-5 sm:px-8', hasQuery ? 'pb-10 pt-8' : 'min-h-[420px] pb-10 pt-16 sm:min-h-[540px] sm:pb-14']">
        <h1 class="text-lg font-semibold sm:text-xl">{{ t('Season-by-season recaps of your shows.') }}</h1>

        <div class="mt-4 max-w-2xl">
          <SearchInput
            ref="searchInput"
            v-model="searchQuery"
            :loading="isSearching"
            :placeholders="[t('Search a show, e.g. Breaking Bad')]"
            controls="show-results"
            @submit="submitSearch"
            @browse="focusResults"
          />
        </div>

        <p v-if="!hasQuery" class="mt-4 text-sm text-muted-foreground">
          {{ t('Try') }}
          <template v-for="(title, index) in suggestions" :key="title">
            <button type="button" class="rounded-sm text-foreground underline decoration-muted-foreground/50 underline-offset-4 transition hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground" @click="chooseQuery(title)">{{ title }}</button>{{ index < suggestions.length - 1 ? ', ' : '' }}
          </template>
        </p>
      </div>
    </div>

    <main class="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
      <HomeRecentLibrary v-if="user && !hasQuery" :key="user.sub" :user-id="user.sub" />

      <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ searchAnnouncement }}</p>
      <section id="show-results" ref="resultsSection" :aria-busy="isSearching" aria-labelledby="results-heading" @keydown="onResultsKeydown">
        <template v-if="hasQuery">
          <div class="mb-6 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-8">
            <div class="min-w-0">
              <p v-if="isSearching" class="mb-1 text-xs text-muted-foreground">{{ t('Searching the catalogue…') }}</p>
              <h2 id="results-heading" class="break-words text-xl font-semibold tracking-tight sm:text-2xl">{{ t('Results for “{query}”', { query: normalizedQuery }) }}</h2>
            </div>
            <span v-if="!isSearching && !searchError" class="text-sm text-muted-foreground">{{ t(searchResults.length === 1 ? '{count} show' : '{count} shows', { count: searchResults.length }) }}</span>
          </div>

          <div v-if="isSearching" aria-hidden="true" class="space-y-8 motion-safe:animate-pulse">
            <div class="flex gap-5 rounded-2xl border border-border bg-muted/20 p-4 sm:p-6">
              <div class="aspect-[2/3] w-24 shrink-0 rounded-xl bg-muted sm:w-32" />
              <div class="flex flex-1 flex-col justify-center gap-4"><div class="h-3 w-20 rounded bg-muted" /><div class="h-7 w-2/3 rounded bg-muted" /><div class="h-3 w-1/3 rounded bg-muted" /></div>
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-6">
              <div v-for="i in 6" :key="i"><div class="aspect-[2/3] rounded-xl bg-muted" /><div class="mt-3 h-4 w-3/4 rounded bg-muted" /></div>
            </div>
          </div>
          <div v-else-if="searchError" class="rounded-2xl border border-border bg-muted/20 px-6 py-14 text-center">
            <WifiOff class="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" />
            <h3 class="text-lg font-semibold">{{ t('Search isn’t responding') }}</h3>
            <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{{ t(searchError) }}</p>
            <button type="button" class="mt-6 inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-3 text-sm font-medium text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground" @click="searchNow"><RefreshCw class="size-4" aria-hidden="true" /> {{ t('Try again') }}</button>
          </div>
          <div v-else-if="searchResults.length" class="space-y-8">
            <ShowSearchCard :show="searchResults[0]!" featured data-show-result />
            <div v-if="searchResults.length > 1">
              <h3 class="mb-5 text-sm font-medium text-muted-foreground">{{ t('More matches') }}</h3>
              <div class="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-6">
                <ShowSearchCard v-for="show in searchResults.slice(1)" :key="show.traktId" :show="show" data-show-result />
              </div>
            </div>
          </div>
          <div v-else class="rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-14 text-center">
            <SearchX class="mx-auto mb-4 size-9 text-muted-foreground" aria-hidden="true" />
            <h3 class="text-lg font-semibold">{{ t('No shows found yet') }}</h3>
            <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{{ t('Try a shorter title, check the spelling, or search with the show\'s original title.') }}</p>
            <button type="button" class="mt-6 rounded-xl border border-border px-5 py-3 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground" @click="clearSearch">{{ t('Clear search') }}</button>
          </div>
        </template>

        <template v-else>
          <div class="mb-6 border-t border-border pt-8">
            <h2 id="results-heading" class="text-xl font-semibold tracking-tight sm:text-2xl">{{ t('Trending now') }}</h2>
          </div>
          <div v-if="trendingStatus === 'pending'" :aria-label="t('Loading trending shows')" class="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-5">
            <div v-for="i in 5" :key="i" class="aspect-[2/3] rounded-xl bg-muted motion-safe:animate-pulse" />
          </div>
          <div v-else-if="featuredShows?.length" class="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-5">
            <ShowSearchCard v-for="show in featuredShows" :key="show.traktId" :show="show" data-show-result />
          </div>
          <div v-else class="rounded-2xl border border-border px-6 py-10 text-center text-sm text-muted-foreground">
            <p>{{ t('Trending shows are unavailable right now. You can still search for your favorites above.') }}</p>
            <button type="button" class="mt-4 rounded-lg border border-border px-4 py-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground" @click="refreshTrending()">{{ t('Retry trending shows') }}</button>
          </div>
        </template>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
import { RefreshCw, SearchX, WifiOff } from 'lucide-vue-next';
import { useEventListener } from '@vueuse/core';
import SearchInput from '~/components/ui/SearchInput.vue';
import ShowSearchCard from '~/components/ShowSearchCard.vue';
import HomeRecentLibrary from '~/components/HomeRecentLibrary.vue';
import { proxiedImageUrl } from '~/lib/image-url';
import type { TraktShowCard } from '~/types/trakt.types';

const user = useSupabaseUser();
const route = useRoute();
const router = useRouter();
const readRouteQuery = () => typeof route.query.q === 'string' ? route.query.q.slice(0, 100) : '';
const searchQuery = ref(readRouteQuery());
const searchInput = ref<InstanceType<typeof SearchInput> | null>(null);
const resultsSection = ref<HTMLElement | null>(null);
const suggestions = ['Breaking Bad', 'Severance', 'The Last of Us'];
const { results: searchResults, isSearching, error: searchError, searchNow, normalizedQuery, hasQuery } = useShowSearch(searchQuery);
const { data: featuredShows, status: trendingStatus, refresh: refreshTrending } = useFetch<TraktShowCard[]>('/api/shows/trending', { key: 'trending-shows' });
// The most watched show with artwork fills the top of the page.
const spotlight = computed(() => featuredShows.value?.find(show => show.backdrop));

const searchAnnouncement = computed(() => {
  if (!hasQuery.value) return '';
  if (isSearching.value) return t('Searching for {query}.', { query: normalizedQuery.value });
  if (searchError.value) return t(searchError.value);
  return t(searchResults.value.length === 1 ? '{count} show found for {query}.' : '{count} shows found for {query}.', { count: searchResults.value.length, query: normalizedQuery.value });
});

// Keep the search shareable and restore it when returning from a show page.
let pendingUrlQuery: string | null = null;
watch(normalizedQuery, async query => {
  if (route.path !== '/' || readRouteQuery() === query) return;
  pendingUrlQuery = query;
  try {
    await router.replace({ path: '/', query: { ...route.query, q: query || undefined }, hash: route.hash });
  } finally {
    if (pendingUrlQuery === query) pendingUrlQuery = null;
  }
});
watch(() => route.query.q, () => {
  if (route.path === '/' && pendingUrlQuery === null) searchQuery.value = readRouteQuery();
});

function clearSearch() {
  searchQuery.value = '';
  searchInput.value?.focus();
}

function chooseQuery(query: string) {
  searchQuery.value = query;
  searchInput.value?.focus();
  void searchNow();
}

function focusResults() {
  resultsSection.value?.querySelector<HTMLAnchorElement>('[data-show-result]')?.focus();
}

async function submitSearch() {
  const submittedQuery = normalizedQuery.value;
  await searchNow();
  if (normalizedQuery.value !== submittedQuery || isSearching.value) return;
  await nextTick();
  focusResults();
}

function onResultsKeydown(event: KeyboardEvent) {
  if (!(event.target instanceof HTMLAnchorElement) || !event.target.hasAttribute('data-show-result')) return;
  const links = [...(resultsSection.value?.querySelectorAll<HTMLAnchorElement>('[data-show-result]') ?? [])];
  const index = links.indexOf(event.target);
  const offset = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
  if (event.key === 'Escape' || (event.key === 'ArrowUp' && index === 0)) {
    event.preventDefault();
    searchInput.value?.focus();
  } else if (offset) {
    event.preventDefault();
    links[Math.max(0, Math.min(links.length - 1, index + offset))]?.focus();
  }
}

useEventListener('keydown', event => {
  const target = event.target as HTMLElement | null;
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
  event.preventDefault();
  searchInput.value?.focus();
});
</script>
