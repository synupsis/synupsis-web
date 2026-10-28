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
    show: { name: `Series ${showId}`, image: `https://example.com/${showId}.jpg` },
    ...overrides,
  };
}

// Exercise the real route and mapper. The transport applies database filters,
// ordering and limits to rows, including fields omitted from the returned select.
function createLibrary(rows, databaseError = null) {
  let queries = 0;
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
            .map(row => Object.fromEntries(columns.replace(/show\([^)]*\)/, 'show').split(',').map(column => {
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
        throw new Error(`Unexpected dependency: ${specifier}`);
      },
    }, { filename, timeout: 1000 });
    modules.set(filename, module.exports);
    return module.exports;
  }
  return {
    request: async (userId = 'viewer-a', query = {}) => structuredClone(await load('server/api/home/library.get.ts').default({ userId, query })),
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
    updatedAt: '2026-10-07T12:00:00Z', name: 'Series show-7', image: 'https://example.com/show-7.jpg',
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
});
