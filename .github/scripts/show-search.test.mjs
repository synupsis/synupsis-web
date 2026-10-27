import assert from 'node:assert/strict';
import test from 'node:test';
import {
  escapeShowSearchQuery,
  mapShowSearchResults,
  normalizeShowSearchQuery,
  SHOW_SEARCH_LIMIT,
} from '../../server/utils/show-search.ts';

function entry(id, title, extra = {}) {
  return { show: { ids: { trakt: id, slug: `show-${id}` }, title, ...extra } };
}

test('normalizes whitespace and compatibility characters without changing title accents', () => {
  assert.equal(normalizeShowSearchQuery('  Ｄａｒｋ\t\n Matter  '), 'Dark Matter');
  assert.equal(normalizeShowSearchQuery('  Les  Revenants '), 'Les Revenants');
  assert.equal(normalizeShowSearchQuery('Série'), 'Série');
});

test('treats search syntax in titles literally', () => {
  assert.equal(escapeShowSearchQuery('Law & Order: SVU (1999)'), 'Law \\& Order\\: SVU \\(1999\\)');
  assert.equal(escapeShowSearchQuery('Mr. Robot'), 'Mr. Robot');
  assert.equal(escapeShowSearchQuery('a+b / c?'), 'a\\+b \\/ c\\?');
  assert.equal(escapeShowSearchQuery('a\\b'), 'a\\\\b');
});

test('prioritizes exact and prefix titles while preserving provider order for other matches', () => {
  const results = mapShowSearchResults([
    entry(1, 'Alias result'),
    entry(2, 'Dark Matter'),
    entry(3, 'Another translated result'),
    entry(4, 'DARK'),
    entry(5, 'Dark Winds'),
  ], 'Dark');
  assert.deepEqual(results.map(show => show.traktId), [4, 2, 5, 1, 3]);
  assert.equal(mapShowSearchResults([entry(1, 'Another result'), entry(2, 'La Révolution')], 'la revolution')[0].traktId, 2);
});

test('keeps shows without posters and normalizes supported poster URL formats', () => {
  const results = mapShowSearchResults([
    entry(1, 'Missing artwork'),
    entry(2, 'Empty artwork', { images: { poster: [] } }),
    entry(3, 'No poster', { images: {} }),
    entry(4, 'Bare URL', { images: { poster: ['cdn.example.com/poster.webp'] } }),
    entry(5, 'HTTPS URL', { images: { poster: ['https://cdn.example.com/poster.webp'] } }),
    entry(6, 'Protocol relative URL', { images: { poster: ['//cdn.example.com/poster.webp'] } }),
    entry(7, 'Invalid URL', { images: { poster: ['javascript:alert(1)'] } }),
  ], 'artwork');
  assert.equal(results.length, 7);
  assert.deepEqual(results.map(show => show.image), ['', '', '',
    'https://cdn.example.com/poster.webp', 'https://cdn.example.com/poster.webp',
    'https://cdn.example.com/poster.webp', '']);
});

test('ignores malformed entries and deduplicates shows by Trakt ID', () => {
  const results = mapShowSearchResults([
    null, {}, { show: null }, { show: 'invalid' },
    entry(0, 'Invalid ID'), entry(1.5, 'Invalid ID'), entry(1, ' '),
    { show: { title: 'Missing slug', ids: { trakt: 1 } } },
    entry(2, 'A valid show'), entry(2, 'A duplicate show'), entry(3, 'Another show'),
  ], 'show');
  assert.deepEqual(results.map(show => show.traktId), [2, 3]);
  assert.deepEqual(mapShowSearchResults(null, 'show'), []);
  assert.deepEqual(mapShowSearchResults({ error: 'upstream failure' }, 'show'), []);
});

test('returns display metadata safely', () => {
  const [show] = mapShowSearchResults([entry(1, ' Dark ', {
    year: 2017, overview: ' A mystery. ', rating: 8.7, genres: ['drama', null, 1, 'science-fiction'],
  })], 'dark');
  assert.deepEqual(show, {
    traktId: 1, slug: 'show-1', name: 'Dark', image: '', year: 2017,
    overview: 'A mystery.', rating: 8.7, genres: ['drama', 'science-fiction'],
  });
  const [invalid] = mapShowSearchResults([entry(2, 'Invalid metadata', {
    year: NaN, overview: {}, rating: Infinity, genres: 'drama',
  })], 'invalid');
  assert.equal(invalid.year, null);
  assert.equal(invalid.rating, null);
  assert.equal(invalid.overview, '');
  assert.deepEqual(invalid.genres, []);
});

test('caps results after ranking so an exact match is not discarded', () => {
  const payload = Array.from({ length: SHOW_SEARCH_LIMIT + 5 }, (_, index) => entry(index + 1, `Some title ${index}`));
  payload.push(entry(999, 'The title'));
  const results = mapShowSearchResults(payload, 'The title');
  assert.equal(results.length, SHOW_SEARCH_LIMIT);
  assert.equal(results[0].traktId, 999);
});
