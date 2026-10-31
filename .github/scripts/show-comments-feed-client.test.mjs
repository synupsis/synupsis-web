import assert from 'node:assert/strict';
import test from 'node:test';
import { effectScope, ref } from 'vue';
import { useShowCommentsFeed } from '../../composables/useShowCommentsFeed.ts';

const comment = id => ({
  season: 1,
  episode: 2,
  comment: {
    id,
    parentId: null,
    isSpoiler: false,
    markedSpoilerByAuthor: false,
    reportedAsSpoiler: false,
    isSpoilerReported: false,
    authorName: 'Viewer',
    authorAvatarUrl: null,
    body: `Comment ${id}`,
    createdAt: '2026-10-30T12:00:00Z',
    isOwn: false,
    isReported: false,
    likeCount: 0,
    isLiked: false,
    replies: [],
  },
});
const page = (ids, hasMore = false) => ({ comments: ids.map(comment), hasMore });
const ids = feed => feed.items.value.map(item => item.comment.id);
const settle = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

function createFeed(t) {
  const originalFetch = globalThis.$fetch;
  const requests = [];
  // Deliberately ignore abort, as a response may already be on its way.
  globalThis.$fetch = (url, options) => new Promise((resolve, reject) => {
    requests.push({ url, options, resolve, reject });
  });
  const scope = effectScope();
  const slug = ref('lost');
  const progressKey = ref('1:2');
  const sort = ref('newest');
  const feed = scope.run(() => useShowCommentsFeed({
    slug: () => slug.value,
    progressKey: () => progressKey.value,
    sort: () => sort.value,
  }));
  t.after(() => {
    scope.stop();
    globalThis.$fetch = originalFetch;
  });
  return { feed, requests, slug, progressKey, sort, scope };
}

test('loads newest comments and appends pages using the number already displayed', async t => {
  const { feed, requests } = createFeed(t);
  const first = feed.reload();
  assert.equal(requests[0].url, '/api/shows/lost/comments');
  assert.deepEqual(requests[0].options.query, { sort: 'newest', offset: 0 });
  assert.equal(feed.status.value, 'loading');
  await feed.loadMore();
  assert.equal(requests.length, 1);
  requests[0].resolve(page(['a', 'b'], true));
  await first;

  const more = feed.loadMore();
  assert.deepEqual(requests[1].options.query, { sort: 'newest', offset: 2 });
  assert.deepEqual(ids(feed), ['a', 'b']);
  assert.equal(feed.loadingMore.value, true);
  await feed.loadMore();
  assert.equal(requests.length, 2);
  requests[1].resolve(page(['c']));
  await more;

  assert.deepEqual(ids(feed), ['a', 'b', 'c']);
  assert.equal(feed.status.value, 'ready');
  assert.equal(feed.loadingMore.value, false);
  assert.equal(feed.hasMore.value, false);
  await feed.loadMore();
  assert.equal(requests.length, 2);
});

for (const nextSort of ['oldest', 'most-liked', 'episode']) {
  test(`changing the sort to ${nextSort} replaces the feed and restarts pagination`, async t => {
    const { feed, requests, sort } = createFeed(t);
    const first = feed.reload();
    requests[0].resolve(page(['a', 'b'], true));
    await first;
    const more = feed.loadMore();
    requests[1].resolve(page(['c'], true));
    await more;

    sort.value = nextSort;
    assert.deepEqual(requests[2].options.query, { sort: nextSort, offset: 0 });
    assert.deepEqual(ids(feed), []);
    assert.equal(feed.status.value, 'loading');
    assert.equal(feed.hasMore.value, false);
    requests[2].resolve(page(['fresh'], true));
    await settle();
    assert.deepEqual(ids(feed), ['fresh']);

    const nextPage = feed.loadMore();
    assert.deepEqual(requests[3].options.query, { sort: nextSort, offset: 1 });
    requests[3].resolve(page(['next']));
    await nextPage;
    assert.deepEqual(ids(feed), ['fresh', 'next']);
  });
}

test('a previous first page cannot replace a newer sort even when abort is ignored', async t => {
  const { feed, requests, sort } = createFeed(t);
  const initial = feed.reload();
  sort.value = 'oldest';
  assert.equal(requests[0].options.signal.aborted, true);
  requests[1].resolve(page(['current']));
  await settle();
  requests[0].resolve(page(['stale'], true));
  await initial;

  assert.deepEqual(ids(feed), ['current']);
  assert.equal(feed.hasMore.value, false);
  assert.equal(feed.status.value, 'ready');
});

test('an obsolete request failure cannot turn the new sort into an error', async t => {
  const { feed, requests, sort } = createFeed(t);
  const initial = feed.reload();
  sort.value = 'most-liked';
  requests[0].reject(new Error('The old request failed'));
  await initial;
  assert.equal(feed.status.value, 'loading');
  assert.equal(feed.loadMoreError.value, false);
  requests[1].resolve(page(['current']));
  await settle();
  assert.deepEqual(ids(feed), ['current']);
  assert.equal(feed.status.value, 'ready');
});

test('an obsolete next page cannot append comments or finish pagination for a newer sort', async t => {
  const { feed, requests, sort } = createFeed(t);
  const initial = feed.reload();
  requests[0].resolve(page(['old-first'], true));
  await initial;
  const obsoletePage = feed.loadMore();

  sort.value = 'episode';
  assert.equal(requests[1].options.signal.aborted, true);
  assert.equal(feed.loadingMore.value, false);
  requests[2].resolve(page(['new-first'], true));
  await settle();
  const currentPage = feed.loadMore();
  requests[1].resolve(page(['old-next']));
  await obsoletePage;
  assert.deepEqual(ids(feed), ['new-first']);
  assert.equal(feed.hasMore.value, true);
  assert.equal(feed.loadingMore.value, true);
  assert.equal(feed.loadMoreError.value, false);

  requests[3].resolve(page(['new-next']));
  await currentPage;
  assert.deepEqual(ids(feed), ['new-first', 'new-next']);
  assert.equal(feed.loadingMore.value, false);
});

test('a failed next page preserves comments and retries from the same offset', async t => {
  const { feed, requests } = createFeed(t);
  const initial = feed.reload();
  requests[0].resolve(page(['a', 'b'], true));
  await initial;
  const failedPage = feed.loadMore();
  requests[1].reject(new Error('Network unavailable'));
  await failedPage;

  assert.deepEqual(ids(feed), ['a', 'b']);
  assert.equal(feed.status.value, 'ready');
  assert.equal(feed.hasMore.value, true);
  assert.equal(feed.loadingMore.value, false);
  assert.equal(feed.loadMoreError.value, true);

  const retry = feed.loadMore();
  assert.deepEqual(requests[2].options.query, { sort: 'newest', offset: 2 });
  assert.equal(feed.loadMoreError.value, false);
  requests[2].resolve(page(['c']));
  await retry;
  assert.deepEqual(ids(feed), ['a', 'b', 'c']);
  assert.equal(feed.hasMore.value, false);
});

test('changes to viewing progress and series hide the old feed and reload the first page', async t => {
  const { feed, requests, slug, progressKey } = createFeed(t);
  const initial = feed.reload();
  requests[0].resolve(page(['old-progress'], true));
  await initial;
  progressKey.value = '1:1';
  assert.deepEqual(ids(feed), []);
  assert.equal(feed.hasMore.value, false);
  assert.equal(feed.status.value, 'loading');
  assert.equal(requests[1].url, '/api/shows/lost/comments');
  assert.deepEqual(requests[1].options.query, { sort: 'newest', offset: 0 });

  slug.value = 'dark';
  assert.equal(requests[1].options.signal.aborted, true);
  assert.equal(requests[2].url, '/api/shows/dark/comments');
  assert.deepEqual(requests[2].options.query, { sort: 'newest', offset: 0 });
  requests[2].resolve(page(['new-series']));
  await settle();
  requests[1].resolve(page(['old-series'], true));
  await settle();
  assert.deepEqual(ids(feed), ['new-series']);
  assert.equal(feed.hasMore.value, false);
});

test('a failed initial load can be retried without leaving an error state', async t => {
  const { feed, requests } = createFeed(t);
  const initial = feed.reload();
  requests[0].reject(new Error('Network unavailable'));
  await initial;
  assert.equal(feed.status.value, 'error');
  assert.deepEqual(ids(feed), []);

  const retry = feed.reload();
  assert.equal(feed.status.value, 'loading');
  assert.deepEqual(requests[1].options.query, { sort: 'newest', offset: 0 });
  requests[1].resolve(page(['recovered']));
  await retry;
  assert.equal(feed.status.value, 'ready');
  assert.deepEqual(ids(feed), ['recovered']);
});

test('unmount aborts pending pagination and prevents late results or later reloads', async t => {
  const { feed, requests, scope, slug, progressKey, sort } = createFeed(t);
  const initial = feed.reload();
  requests[0].resolve(page(['visible'], true));
  await initial;
  const pending = feed.loadMore();
  scope.stop();
  assert.equal(requests[1].options.signal.aborted, true);
  requests[1].resolve(page(['late']));
  await pending;
  assert.deepEqual(ids(feed), ['visible']);

  slug.value = 'dark';
  progressKey.value = '3:4';
  sort.value = 'oldest';
  await feed.reload();
  await feed.loadMore();
  assert.equal(requests.length, 2);
});
