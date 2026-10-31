import { onScopeDispose, ref, watch } from 'vue';
import type { ShowCommentSort, ShowFeedComment } from '~/types/episode-comment.types';

export function useShowCommentsFeed(options: {
  slug: () => string;
  progressKey: () => string;
  sort: () => ShowCommentSort;
}) {
  const items = ref<ShowFeedComment[]>([]);
  const status = ref<'loading' | 'ready' | 'error'>('loading');
  const hasMore = ref(false);
  const loadingMore = ref(false);
  const loadMoreError = ref(false);
  let requestId = 0;
  let controller: AbortController | undefined;
  let disposed = false;

  async function load(offset = 0) {
    if (disposed) return;
    const currentRequest = ++requestId;
    controller?.abort();
    controller = new AbortController();
    loadMoreError.value = false;
    loadingMore.value = offset > 0;
    if (!offset) {
      status.value = 'loading';
      items.value = [];
      hasMore.value = false;
    }
    try {
      const response = await $fetch<{ comments: ShowFeedComment[]; hasMore: boolean }>(
        `/api/shows/${options.slug()}/comments`,
        {
          query: { sort: options.sort(), offset },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
          retry: 0,
        },
      );
      // A previous sort or page can still finish after its request was aborted.
      if (disposed || currentRequest !== requestId) return;
      items.value = offset ? [...items.value, ...response.comments] : response.comments;
      hasMore.value = response.hasMore;
      status.value = 'ready';
    } catch {
      if (disposed || currentRequest !== requestId) return;
      if (offset) loadMoreError.value = true;
      else status.value = 'error';
    } finally {
      if (!disposed && currentRequest === requestId) {
        loadingMore.value = false;
        controller = undefined;
      }
    }
  }

  const reload = () => load();
  const loadMore = () => {
    if (status.value !== 'ready' || !hasMore.value || loadingMore.value) return;
    return load(items.value.length);
  };

  watch([options.slug, options.progressKey, options.sort], reload, { flush: 'sync' });
  onScopeDispose(() => {
    disposed = true;
    requestId += 1;
    controller?.abort();
  });

  return { items, status, hasMore, loadingMore, loadMoreError, reload, loadMore };
}
