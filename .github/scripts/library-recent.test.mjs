import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const compiledModules = new Map();
function compiledModule(filename) {
  if (!compiledModules.has(filename)) {
    compiledModules.set(filename, ts.transpileModule(readFileSync(new URL(`../../${filename}`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  return compiledModules.get(filename);
}

function entry(showId, createdAt, overrides = {}) {
  return {
    user_id: 'viewer-a',
    show_id: showId,
    slug: `series-${showId}`,
    season: 2,
    episode: 3,
    spoiler_shield_enabled: true,
    created_at: createdAt,
    updated_at: createdAt,
    show: {
      name: `Series ${showId}`, image: `https://example.com/${showId}.jpg`, trakt_id: 42,
      seasons: [1, 2].map(number => ({ number, first_aired: '2020-01-01T12:00:00Z' })),
    },
    ...overrides,
  };
}

// Exercise the real route and mapper. The transport applies database filters,
// ordering and limits to rows, including fields omitted from the returned select.
function createLibrary(rows, databaseError = null, { episodeResponse, fetchEpisodes } = {}) {
  let queries = 0;
  const episodeRequests = [];
  const fetch = async (url, options) => {
    episodeRequests.push({ url, options: structuredClone(options) });
    if (fetchEpisodes) return fetchEpisodes(url);
    if (episodeResponse instanceof Error) throw episodeResponse;
    return episodeResponse ?? {
      seasonNumber: Number(url.match(/\/seasons\/(\d+)\/episodes$/)[1]),
      episodes: Array.from({ length: 6 }, (_, index) => ({ number: index + 1, firstAired: '2020-01-01T12:00:00Z' })),
    };
  };
  const createError = details => Object.assign(new Error(details.statusMessage), details);
  const client = {
    from(table) {
      assert.equal(table, 'library_entry');
      queries += 1;
      const filters = [];
      const ordering = [];
      let columns = '';
      let limit = Infinity;
      const query = {
        select(value) { columns = value; return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        order(key, { ascending = true } = {}) { ordering.push([key, ascending]); return query; },
        limit(value) { limit = value; return query; },
        async execute() {
          if (databaseError) return { data: null, error: databaseError };
          const data = rows
            .filter(row => filters.every(([key, value]) => row[key] === value))
            .sort((left, right) => {
              for (const [key, ascending] of ordering) {
                const comparison = left[key] < right[key] ? -1 : left[key] > right[key] ? 1 : 0;
                if (comparison) return ascending ? comparison : -comparison;
              }
              return 0;
            })
            .slice(0, limit)
            .map(row => Object.fromEntries(columns.replace(/show\(.*\)/, 'show').split(',').map(column => {
              const key = column.trim();
              return [key, row[key]];
            })));
          return { data, error: null };
        },
        then(resolve, reject) { return query.execute().then(resolve, reject); },
      };
      return query;
    },
  };
  const modules = new Map();
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename);
    const module = { exports: {} };
    runInNewContext(compiledModule(filename), {
      module,
      exports: module.exports,
      defineEventHandler: handler => handler,
      createError,
      require: specifier => {
        if (specifier === '#supabase/server') return { serverSupabaseClient: async () => client };
        if (specifier === '~/server/utils/require-admin') return {
          requireAuthenticatedUser: async event => {
            if (!event.userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
            return { sub: event.userId };
          },
        };
        if (specifier === '~/server/utils/library') return load('server/utils/library.ts');
        if (specifier === '~/lib/season-availability') return load('lib/season-availability.ts');
        if (specifier === '~/lib/watching-progress') return load('lib/watching-progress.ts');
        throw new Error(`Unexpected dependency: ${specifier}`);
      },
    }, { filename, timeout: 1000 });
    modules.set(filename, module.exports);
    return module.exports;
  }
  return {
    request: async (userId = 'viewer-a', query = {}) => structuredClone(await load('server/api/home/library.get.ts').default({ userId, query, $fetch: fetch })),
    episodeRequests,
    get queries() { return queries; },
  };
}

test('returns the five latest additions, ignoring later progress or shield updates', async () => {
  const rows = [1, 7, 3, 6, 2, 5, 4].map(number => entry(`show-${number}`, `2026-10-${String(number).padStart(2, '0')}T12:00:00Z`));
  rows.find(row => row.show_id === 'show-1').updated_at = '2026-10-28T12:00:00Z';
  rows.find(row => row.show_id === 'show-2').updated_at = '2026-10-27T12:00:00Z';
  const library = createLibrary(rows);
  const { entries } = await library.request();
  assert.deepEqual(entries.map(row => row.slug), ['series-show-7', 'series-show-6', 'series-show-5', 'series-show-4', 'series-show-3']);
  assert.deepEqual(entries[0], {
    slug: 'series-show-7', season: 2, episode: 3, spoilerShieldEnabled: true,
    updatedAt: '2026-10-07T12:00:00Z', name: 'Series show-7', image: 'https://example.com/show-7.jpg', isCaughtUp: false,
  });
  rows.find(row => row.show_id === 'show-3').updated_at = '2026-10-29T12:00:00Z';
  assert.deepEqual((await library.request()).entries.map(row => row.slug), entries.map(row => row.slug));
});

test('orders additions with the same timestamp deterministically by show id', async () => {
  const library = createLibrary(['c', 'a', 'b'].map(id => entry(id, '2026-10-28T12:00:00Z')));
  assert.deepEqual((await library.request()).entries.map(row => row.slug), ['series-a', 'series-b', 'series-c']);
});

test('returns only the authenticated viewer library, irrespective of user ids in the query', async () => {
  const library = createLibrary([
    entry('shared', '2026-10-27T12:00:00Z', { spoiler_shield_enabled: false }),
    entry('shared', '2026-10-28T12:00:00Z', { user_id: 'viewer-b', episode: 8 }),
    entry('b-only', '2026-10-29T12:00:00Z', { user_id: 'viewer-b' }),
  ]);
  const own = (await library.request('viewer-a', { user_id: 'viewer-b', userId: 'viewer-b' })).entries;
  assert.deepEqual(own.map(row => [row.slug, row.episode, row.spoilerShieldEnabled]), [['series-shared', 3, false]]);
  assert.deepEqual((await library.request('viewer-b')).entries.map(row => row.slug), ['series-b-only', 'series-shared']);
  assert.deepEqual((await library.request('viewer-c')).entries, []);
});

test('rejects anonymous requests before reading the database', async () => {
  const library = createLibrary([entry('a', '2026-10-28T12:00:00Z')]);
  await assert.rejects(library.request(null), { statusCode: 401 });
  assert.equal(library.queries, 0);
  assert.equal(library.episodeRequests.length, 0);
});

test('reports database failures without exposing database details', async () => {
  const library = createLibrary([], { message: 'private database details' });
  await assert.rejects(library.request(), { statusCode: 500, statusMessage: 'Could not load your library.', message: 'Could not load your library.' });
});

test('supports an empty library and incomplete show metadata', async () => {
  assert.deepEqual(await createLibrary([]).request(), { entries: [] });
  const library = createLibrary([entry('a', '2026-10-28T12:00:00Z', { season: null, episode: 0, show: null })]);
  const [result] = (await library.request()).entries;
  assert.equal(result.name, 'series-a');
  assert.equal(result.image, null);
  assert.equal(result.season, null);
  assert.equal(result.episode, 0);
  assert.equal(result.isCaughtUp, false);
  assert.equal(library.episodeRequests.length, 0);
});

const aired = number => ({ number, firstAired: '2020-01-01T12:00:00Z' });
const catalogue = (episodes, seasonNumber = 2) => ({ seasonNumber, episodes });

test('confirms watched progress against the last released episode, not the number of catalogue rows', async () => {
  const library = createLibrary([
    entry('caught', '2026-10-28T12:00:00Z', { episode: 3 }),
    entry('behind', '2026-10-27T12:00:00Z', { episode: 2 }),
  ], null, { episodeResponse: catalogue([aired(1), aired(3)]) });
  assert.deepEqual((await library.request()).entries.map(row => [row.slug, row.isCaughtUp]), [
    ['series-caught', true], ['series-behind', false],
  ]);
  assert.equal(library.episodeRequests.length, 2);
});

test('uses the latest released regular season and ignores specials and future seasons', async () => {
  const row = entry('a', '2026-10-28T12:00:00Z', { episode: 6 });
  row.show.seasons = [
    { number: 0, first_aired: '2020-01-01T12:00:00Z' },
    { number: 3, first_aired: '2999-01-01T12:00:00Z' },
    { number: 2, first_aired: '2020-01-01T12:00:00Z' },
    { number: 1, first_aired: '2020-01-01T12:00:00Z' },
    { number: 4, first_aired: null },
  ];
  const library = createLibrary([row]);
  assert.equal((await library.request()).entries[0].isCaughtUp, true);
  assert.equal(library.episodeRequests[0].url, '/api/shows/42/seasons/2/episodes');
});

test('does not fetch episode metadata for saved-only, unstarted, previous-season or unknown series', async () => {
  const unknown = entry('unknown', '2026-10-28T12:00:00Z', { episode: 6 });
  unknown.show.trakt_id = 0;
  const noSeasons = entry('no-seasons', '2026-10-28T12:00:00Z', { episode: 6 });
  noSeasons.show.seasons = [];
  const library = createLibrary([
    entry('saved', '2026-10-28T12:00:00Z', { season: null, episode: 0 }),
    entry('starting', '2026-10-28T12:00:00Z', { episode: 0 }),
    entry('previous', '2026-10-28T12:00:00Z', { season: 1, episode: 99 }),
    unknown, noSeasons,
  ]);
  assert.ok((await library.request()).entries.every(row => row.isCaughtUp === false));
  assert.equal(library.episodeRequests.length, 0);
});

for (const [reason, response] of [
  ['missing air date', catalogue([aired(1), { number: 2, firstAired: null }])],
  ['invalid air date', catalogue([aired(1), { number: 2, firstAired: 'unknown' }])],
  ['empty catalogue', catalogue([])],
  ['wrong season', catalogue([aired(1)], 1)],
  ['unavailable catalogue', new Error('Episode service unavailable')],
]) {
  test(`keeps progress and returns an unconfirmed status with ${reason}`, async () => {
    const library = createLibrary([entry('a', '2026-10-28T12:00:00Z', { episode: 6 })], null, { episodeResponse: response });
    const [result] = (await library.request()).entries;
    assert.equal(result.isCaughtUp, false);
    assert.equal(result.season, 2);
    assert.equal(result.episode, 6);
    assert.equal(result.name, 'Series a');
  });
}

test('an announced future episode does not stop a viewer being caught up with aired episodes', async () => {
  const library = createLibrary([entry('a', '2026-10-28T12:00:00Z', { episode: 3 })], null, {
    episodeResponse: catalogue([aired(1), aired(3), { number: 4, firstAired: '2999-01-01T12:00:00Z' }]),
  });
  assert.equal((await library.request()).entries[0].isCaughtUp, true);
});

test('only enriches the authenticated viewer five selected entries, in parallel', async () => {
  const rows = Array.from({ length: 7 }, (_, index) => entry(`own-${index}`, `2026-10-${String(index + 1).padStart(2, '0')}T12:00:00Z`, { episode: 6 }));
  const foreign = entry('foreign', '2026-10-28T12:00:00Z', { user_id: 'viewer-b', episode: 6 });
  foreign.show.trakt_id = 99;
  const pending = [];
  const library = createLibrary([...rows, foreign], null, { fetchEpisodes: () => new Promise(resolve => pending.push(resolve)) });
  const request = library.request('viewer-a');
  for (let i = 0; i < 10 && pending.length < 5; i += 1) await Promise.resolve();
  assert.equal(pending.length, 5);
  assert.ok(library.episodeRequests.every(({ url }) => url === '/api/shows/42/seasons/2/episodes'));
  for (const resolve of pending) resolve(catalogue([aired(6)]));
  const response = await request;
  assert.equal(response.entries.length, 5);
  assert.ok(response.entries.every(row => row.isCaughtUp));
});

test('reuses safe matching show slugs but resolves invalid or mismatched slugs with the real Trakt id', async () => {
  const library = createLibrary([
    entry('safe', '2026-10-28T12:00:00Z', { slug: 'some-series-42' }),
    entry('mismatch', '2026-10-27T12:00:00Z', { slug: 'different-series-99' }),
    entry('path', '2026-10-26T12:00:00Z', { slug: '../private/series-42' }),
  ]);
  await library.request();
  assert.deepEqual(library.episodeRequests.map(({ url }) => url), [
    '/api/shows/some-series-42/seasons/2/episodes',
    '/api/shows/42/seasons/2/episodes',
    '/api/shows/42/seasons/2/episodes',
  ]);
});
