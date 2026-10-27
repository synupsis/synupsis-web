import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import type { TraktShowCard } from '~/types/trakt.types';

const DEBOUNCE_MS = 250;
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_LIMIT = 20;
const CACHE_TTL_MS = 5 * 60_000;

export function useShowSearch(query: Ref<string>) {
  const normalizedQuery = computed(() => query.value.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 100));
  const hasQuery = computed(() => normalizedQuery.value.length >= 2);
  const results = ref<TraktShowCard[]>([]);
  // A query in the URL renders the same pending state during SSR and hydration.
  const isSearching = ref(hasQuery.value);
  const error = ref<string | null>(null);
  const cache = new Map<string, { results: TraktShowCard[]; expiresAt: number }>();

  let generation = 0;
  let disposed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let requestTimer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  function cancelPending() {
    generation += 1;
    clearTimeout(debounceTimer);
    clearTimeout(requestTimer);
    debounceTimer = undefined;
    requestTimer = undefined;
    controller?.abort();
    controller = undefined;
  }

  async function runSearch(value: string, requestGeneration: number, bypassCache = false) {
    const cacheKey = value.toLowerCase();
    const cached = cache.get(cacheKey);

    if (!bypassCache && cached && cached.expiresAt > Date.now()) {
      results.value = cached.results;
      isSearching.value = false;
      // Refresh insertion order so the least recently used query is evicted first.
      cache.delete(cacheKey);
      cache.set(cacheKey, cached);
      return;
    }

    const requestController = new AbortController();
    controller = requestController;
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      // ofetch's timeout is ignored when a signal is supplied. Keep our own
      // deadline so cancellation and a bounded waiting time both work.
      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          timedOut = true;
          requestController.abort();
          reject(new Error('Show search timed out'));
        }, REQUEST_TIMEOUT_MS);
        requestTimer = timeout;
      });
      const shows = await Promise.race([
        $fetch<TraktShowCard[]>('/api/shows/search', {
          query: { q: value },
          signal: requestController.signal,
          retry: 0,
        }),
        deadline,
      ]);

      // Aborting alone is insufficient: a response can already be on its way.
      if (disposed || requestGeneration !== generation) return;

      results.value = shows;
      cache.delete(cacheKey);
      cache.set(cacheKey, { results: shows, expiresAt: Date.now() + CACHE_TTL_MS });
      if (cache.size > CACHE_LIMIT) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) cache.delete(oldestKey);
      }
    } catch {
      if (disposed || requestGeneration !== generation) return;
      error.value = timedOut
        ? 'Search is taking longer than expected. Please try again.'
        : 'We couldn’t search for shows. Please try again.';
    } finally {
      clearTimeout(timeout);
      if (!disposed && requestGeneration === generation) {
        isSearching.value = false;
        controller = undefined;
        requestTimer = undefined;
      }
    }
  }

  function prepareSearch() {
    cancelPending();
    results.value = [];
    error.value = null;
    isSearching.value = hasQuery.value;
  }

  async function searchNow() {
    if (disposed || import.meta.server) return;
    const retrying = error.value !== null;
    prepareSearch();
    if (hasQuery.value) await runSearch(normalizedQuery.value, generation, retrying);
  }

  watch(normalizedQuery, value => {
    if (disposed || import.meta.server) return;
    prepareSearch();
    if (!hasQuery.value) return;

    const requestGeneration = generation;
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void runSearch(value, requestGeneration);
    }, DEBOUNCE_MS);
  }, { immediate: true, flush: 'sync' });

  onScopeDispose(() => {
    disposed = true;
    cancelPending();
  });

  return { results, isSearching, error, searchNow, normalizedQuery, hasQuery };
}
