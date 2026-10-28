import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const compiledModules = new Map();

function compiledModule(filename) {
  if (!compiledModules.has(filename)) {
    const source = readFileSync(new URL(`../../${filename}`, import.meta.url), 'utf8');
    compiledModules.set(filename, ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  return compiledModules.get(filename);
}

// Run the real route handlers and row mapper, with only the authenticated
// request and Supabase transport replaced by an in-memory database boundary.
function createLibrary() {
  const rows = new Map();
  const writes = [];
  const shows = new Map([[42, { id: 'show-42', name: 'Series A', image: null }], [43, { id: 'show-43', name: 'Series B', image: null }]]);
  let failWrites = false;
  const createError = details => Object.assign(new Error(details.statusMessage), details);
  const requireAuthenticatedUser = async event => {
    if (!event.userId) throw createError({ statusCode: 401, statusMessage: 'Sign in required.' });
    return { sub: event.userId };
  };
  const client = {
    from(table) {
      const filters = [];
      let columns = '';
      let write = null;
      const query = {
        select(value) { columns = value; return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        order() { return query; },
        upsert(value, options) {
          assert.equal(options.onConflict, 'user_id,show_id');
          write = structuredClone(value);
          writes.push(write);
          return query;
        },
        async execute(single) {
          if (write && failWrites) return { data: null, error: { message: 'Unavailable' } };
          if (write) {
            const key = `${write.user_id}:${write.show_id}`;
            // PostgREST upserts update supplied columns only; missing columns
            // receive defaults on insert and retain their value on conflict.
            rows.set(key, { spoiler_shield_enabled: true, ...rows.get(key), ...write });
          }
          const candidates = table === 'show' ? [...shows].map(([trakt_id, show]) => ({ trakt_id, ...show })) : [...rows.values()];
          const selected = candidates.filter(row => filters.every(([key, value]) => row[key] === value))
            .filter(row => !write || row.user_id === write.user_id && row.show_id === write.show_id)
            .map(row => {
              const result = {};
              for (const key of columns.replace(/show\([^)]*\)/, 'show').split(',').map(column => column.trim())) {
                result[key] = key === 'show' ? [...shows.values()].find(show => show.id === row.show_id) : row[key];
              }
              return result;
            });
          return { data: single ? selected[0] ?? null : selected, error: null };
        },
        maybeSingle() { return query.execute(true); },
        single() { return query.execute(true); },
        then(resolve, reject) { return query.execute(false).then(resolve, reject); },
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
      readBody: async event => event.body,
      createError,
      require: specifier => {
        if (specifier === '#supabase/server') return { serverSupabaseClient: async () => client };
        if (specifier === '~/server/utils/require-admin') return { requireAuthenticatedUser };
        if (specifier === '~/server/utils/library') return load('server/utils/library.ts');
        throw new Error(`Unexpected library dependency: ${specifier}`);
      },
    }, { filename, timeout: 1000 });
    modules.set(filename, module.exports);
    return module.exports;
  }
  async function request(method, { userId = 'viewer-a', traktId = 42, body } = {}) {
    const filename = method === 'list' ? 'index.get' : `[traktId].${method}`;
    return structuredClone(await load(`server/api/library/${filename}.ts`).default({ userId, context: { params: { traktId } }, body }));
  }
  return { request, rows, writes, failWrites: () => { failWrites = true; } };
}

const progress = { slug: 'series-a-42', season: 2, episode: 3 };

test('the shield defaults to enabled and a saved choice is returned after another request', async () => {
  const library = createLibrary();
  assert.equal((await library.request('put', { body: progress })).entry.spoilerShieldEnabled, true);
  const disabled = await library.request('put', { body: { ...progress, spoilerShieldEnabled: false } });
  assert.equal(disabled.entry.spoilerShieldEnabled, false);
  const loaded = await library.request('get');
  assert.deepEqual(loaded, disabled);
  assert.equal(loaded.entry.season, 2);
  assert.equal(loaded.entry.episode, 3);
  const enabled = await library.request('put', { body: { ...progress, spoilerShieldEnabled: true } });
  assert.equal(enabled.entry.spoilerShieldEnabled, true);
  assert.equal((await library.request('get')).entry.spoilerShieldEnabled, true);
});

test('progress updates and stopping tracking preserve an omitted shield choice', async () => {
  const library = createLibrary();
  await library.request('put', { body: { ...progress, spoilerShieldEnabled: false } });
  const advanced = await library.request('put', { body: { ...progress, episode: 4 } });
  assert.equal(advanced.entry.spoilerShieldEnabled, false);
  assert.equal(advanced.entry.episode, 4);
  assert.equal(Object.hasOwn(library.writes[1], 'spoiler_shield_enabled'), false);
  const stopped = await library.request('put', { body: { ...progress, season: null } });
  assert.equal(stopped.entry.spoilerShieldEnabled, false);
  assert.equal(stopped.entry.season, null);
  assert.equal(stopped.entry.episode, 0);
});

test('shield choices are isolated by authenticated user and series, including library lists', async () => {
  const library = createLibrary();
  await library.request('put', { body: { ...progress, spoilerShieldEnabled: false, user_id: 'viewer-b', show_id: 'show-43' } });
  await library.request('put', { traktId: 43, body: { ...progress, slug: 'series-b-43' } });
  await library.request('put', { userId: 'viewer-b', body: progress });
  assert.equal((await library.request('get')).entry.spoilerShieldEnabled, false);
  assert.equal((await library.request('get', { traktId: 43 })).entry.spoilerShieldEnabled, true);
  assert.equal((await library.request('get', { userId: 'viewer-b' })).entry.spoilerShieldEnabled, true);
  assert.equal((await library.request('get', { userId: 'viewer-c' })).entry, null);
  const ownList = (await library.request('list')).entries;
  assert.deepEqual(ownList.map(entry => [entry.slug, entry.spoilerShieldEnabled]), [['series-a-42', false], ['series-b-43', true]]);
  assert.equal((await library.request('list', { userId: 'viewer-b' })).entries.length, 1);
  assert.equal(library.writes[0].user_id, 'viewer-a');
  assert.equal(library.writes[0].show_id, 'show-42');
});

for (const spoilerShieldEnabled of [null, 'false', 'true', 0, 1, [], {}]) {
  test(`rejects non-boolean shield input ${JSON.stringify(spoilerShieldEnabled)} without writing`, async () => {
    const library = createLibrary();
    await assert.rejects(library.request('put', { body: { ...progress, spoilerShieldEnabled } }), { statusCode: 400 });
    assert.equal(library.writes.length, 0);
  });
}

test('unauthenticated and unknown-show writes do not create a preference', async () => {
  const library = createLibrary();
  await assert.rejects(library.request('put', { userId: null, body: { ...progress, spoilerShieldEnabled: false } }), { statusCode: 401 });
  await assert.rejects(library.request('put', { traktId: 999, body: { ...progress, spoilerShieldEnabled: false } }), { statusCode: 404 });
  assert.equal(library.rows.size, 0);
});

test('a failed save reports failure instead of returning an unsaved shield choice', async () => {
  const library = createLibrary();
  await library.request('put', { body: progress });
  library.failWrites();
  await assert.rejects(library.request('put', { body: { ...progress, spoilerShieldEnabled: false } }), { statusCode: 500 });
  assert.equal((await library.request('get')).entry.spoilerShieldEnabled, true);
});
