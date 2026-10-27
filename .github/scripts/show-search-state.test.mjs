import assert from 'node:assert/strict';
import test from 'node:test';
import { effectScope, ref } from 'vue';
import { useShowSearch } from '../../composables/useShowSearch.ts';

const show = name => ({ name, slug: name.toLowerCase(), traktId: 1, image: '' });
const settle = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

function createSearch(t, initialQuery = '') {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const originalFetch = globalThis.$fetch;
  const requests = [];
  globalThis.$fetch = (url, options) => new Promise((resolve, reject) => {
    requests.push({ url, options, resolve, reject });
  });
  const scope = effectScope();
  const query = ref(initialQuery);
  const search = scope.run(() => useShowSearch(query));
  t.after(() => {
    scope.stop();
    globalThis.$fetch = originalFetch;
  });
  return { query, search, requests, scope };
}

test('debounces typing, normalizes whitespace and passes punctuation as a query parameter', async t => {
  const { query, search, requests } = createSearch(t);
  query.value = '  Law   & Order?  ';
  assert.equal(search.isSearching.value, true);
  assert.equal(search.normalizedQuery.value, 'Law & Order?');
  t.mock.timers.tick(249);
  assert.equal(requests.length, 0);
  query.value = '  Law   & Order? SVU ';
  t.mock.timers.tick(250);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/shows/search');
  assert.deepEqual(requests[0].options.query, { q: 'Law & Order? SVU' });
  requests[0].resolve([show('Law & Order')]);
  await settle();
  assert.equal(search.isSearching.value, false);
  assert.equal(search.results.value[0].name, 'Law & Order');
});

test('a late response cannot replace results for the current query even when abort is ignored', async t => {
  const { query, search, requests } = createSearch(t);
  query.value = 'Lost';
  t.mock.timers.tick(250);
  query.value = 'Dark';
  assert.equal(requests[0].options.signal.aborted, true);
  t.mock.timers.tick(250);
  requests[1].resolve([show('Dark')]);
  await settle();
  requests[0].resolve([show('Lost')]);
  await settle();
  assert.equal(search.results.value[0].name, 'Dark');
  assert.equal(search.isSearching.value, false);
  assert.equal(search.error.value, null);
});

test('a stale failure does not end loading or show an error for the new search', async t => {
  const { query, search, requests } = createSearch(t);
  query.value = 'Lost';
  t.mock.timers.tick(250);
  query.value = 'Dark';
  t.mock.timers.tick(250);
  requests[0].reject(new Error('Old request failed'));
  await settle();
  assert.equal(search.isSearching.value, true);
  assert.equal(search.error.value, null);
  requests[1].resolve([show('Dark')]);
  await settle();
});

test('clearing or shortening a query cancels pending work and keeps results empty', async t => {
  const { query, search, requests } = createSearch(t);
  query.value = 'Lost';
  t.mock.timers.tick(250);
  query.value = 'L';
  assert.equal(requests[0].options.signal.aborted, true);
  assert.equal(search.hasQuery.value, false);
  assert.equal(search.isSearching.value, false);
  requests[0].resolve([show('Lost')]);
  await settle();
  assert.deepEqual(search.results.value, []);
  query.value = 'Dark';
  query.value = '   ';
  t.mock.timers.tick(250);
  assert.equal(requests.length, 1);
  assert.equal(search.isSearching.value, false);
});

test('submit skips debounce and repeat searches reuse the component cache', async t => {
  const { query, search, requests } = createSearch(t);
  query.value = 'Lost';
  const submitted = search.searchNow();
  assert.equal(requests.length, 1);
  requests[0].resolve([show('Lost')]);
  await submitted;
  t.mock.timers.tick(250);
  assert.equal(requests.length, 1);
  query.value = '';
  query.value = ' lost ';
  await search.searchNow();
  assert.equal(requests.length, 1);
  assert.equal(search.results.value[0].name, 'Lost');
  assert.equal(search.isSearching.value, false);
});

test('a stalled search times out and can be retried successfully', async t => {
  const { query, search, requests } = createSearch(t);
  query.value = 'Lost';
  t.mock.timers.tick(250);
  t.mock.timers.tick(12_000);
  await settle();
  assert.equal(requests[0].options.signal.aborted, true);
  assert.equal(search.isSearching.value, false);
  assert.match(search.error.value, /taking longer/);
  const retry = search.searchNow();
  assert.equal(search.error.value, null);
  assert.equal(search.isSearching.value, true);
  requests[1].resolve([show('Lost')]);
  await retry;
  assert.equal(search.results.value[0].name, 'Lost');
  assert.equal(search.error.value, null);
  requests[0].resolve([show('Old result')]);
  await settle();
  assert.equal(search.results.value[0].name, 'Lost');
});

test('a failed search exposes a retryable error instead of caching an empty result', async t => {
  const { query, search, requests } = createSearch(t);
  query.value = 'Lost';
  t.mock.timers.tick(250);
  requests[0].reject(new Error('Network unavailable'));
  await settle();
  assert.match(search.error.value, /couldn’t search/);
  assert.equal(search.isSearching.value, false);
  const retry = search.searchNow();
  assert.equal(requests.length, 2);
  requests[1].resolve([show('Lost')]);
  await retry;
  assert.equal(search.error.value, null);
  assert.equal(search.results.value[0].name, 'Lost');
});

test('cache expires and evicts older queries rather than growing without limit', async t => {
  const { query, search, requests } = createSearch(t);
  for (let index = 0; index < 21; index += 1) {
    query.value = `Show ${index}`;
    const pending = search.searchNow();
    requests.at(-1).resolve([show(`Show ${index}`)]);
    await pending;
  }
  query.value = 'Show 0';
  const evicted = search.searchNow();
  assert.equal(requests.length, 22);
  requests.at(-1).resolve([show('Show 0')]);
  await evicted;
  t.mock.timers.tick(5 * 60_000);
  const expired = search.searchNow();
  assert.equal(requests.length, 23);
  requests.at(-1).resolve([show('Show 0 updated')]);
  await expired;
  assert.equal(search.results.value[0].name, 'Show 0 updated');
});

test('unmount clears debounce and aborts in-flight requests without applying their results', async t => {
  const { query, search, requests, scope } = createSearch(t);
  query.value = 'Lost';
  t.mock.timers.tick(250);
  scope.stop();
  assert.equal(requests[0].options.signal.aborted, true);
  requests[0].resolve([show('Lost')]);
  await settle();
  assert.deepEqual(search.results.value, []);
  await search.searchNow();
  assert.equal(requests.length, 1);
});

test('initial queries normalize compatibility characters before the 100-character limit', async t => {
  // Each ligature expands to three characters on the server too. Truncating
  // before normalization would send an otherwise valid-looking oversized query.
  const { search, requests } = createSearch(t, 'ﬃ'.repeat(50));
  t.mock.timers.tick(250);
  assert.equal(search.normalizedQuery.value.length, 100);
  assert.equal(requests[0].options.query.q, 'ffi'.repeat(50).slice(0, 100));
  requests[0].resolve([]);
  await settle();
});
