import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { toRecapWallet } from '../../lib/recap-keys.ts';

const filename = 'server/api/recap/keys.get.ts';
const compiled = ts.transpileModule(readFileSync(new URL(`../../${filename}`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Execute the route with a database transport that applies its real filters.
function createEndpoint(libraryRows, { wallet = null, unlimited = false } = {}) {
  const queries = [];
  const service = {
    from(table) {
      queries.push(table);
      const filters = [];
      const query = {
        select() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        neq(key, value) { filters.push(row => row[key] !== value); return query; },
        async maybeSingle() {
          assert.equal(table, 'recap_wallet');
          return { data: wallet, error: null };
        },
        then(resolve, reject) {
          assert.equal(table, 'library_entry');
          return Promise.resolve({
            count: libraryRows.filter(row => filters.every(filter => filter(row))).length,
            error: null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const module = { exports: {} };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    defineEventHandler: handler => handler,
    getQuery: event => event.query,
    createError: details => Object.assign(new Error(details.statusMessage), details),
    require: name => {
      if (name === '#supabase/server') return {
        serverSupabaseUser: async event => event.userId ? { sub: event.userId } : null,
        serverSupabaseServiceRole: () => service,
      };
      if (name === '~/lib/recap-keys') return { toRecapWallet };
      if (name === '~/server/utils/require-admin') return { isAdminUser: async () => unlimited };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename });
  return {
    request: async ({ userId = 'requester', query = { showId: 'show-a' } } = {}) => structuredClone(await module.exports.default({ userId, query })),
    queries,
  };
}

test('counts every other follower when the requester does not follow the series', async () => {
  const api = createEndpoint([
    { show_id: 'show-a', user_id: 'viewer-a' },
    { show_id: 'show-a', user_id: 'viewer-b' },
    { show_id: 'show-b', user_id: 'viewer-c' },
  ]);
  assert.equal((await api.request()).followers, 2);
});

test('excludes the requester only when their library contains the series', async () => {
  const api = createEndpoint([
    { show_id: 'show-a', user_id: 'requester' },
    { show_id: 'show-a', user_id: 'viewer-a' },
    { show_id: 'show-b', user_id: 'viewer-b' },
  ]);
  assert.equal((await api.request()).followers, 1);
});

test('retains a single other follower for a requester outside the library', async () => {
  const api = createEndpoint([{ show_id: 'show-a', user_id: 'viewer-a' }]);
  assert.equal((await api.request()).followers, 1);
});

test('returns zero for an empty audience or only the requester', async () => {
  assert.equal((await createEndpoint([]).request()).followers, 0);
  assert.equal((await createEndpoint([{ show_id: 'show-a', user_id: 'requester' }]).request()).followers, 0);
});

test('omits audience lookup without a show and preserves wallet values', async () => {
  const api = createEndpoint([], { wallet: { keys: 2, points: 14, key_progress: 4 }, unlimited: true });
  const result = await api.request({ query: {} });
  assert.equal(result.followers, null);
  assert.deepEqual(result.wallet, { keys: 2, maxKeys: 5, points: 14, keyProgress: 4, pointsPerKey: 10, unlimited: true });
  assert.deepEqual(api.queries, ['recap_wallet']);
});

test('requires authentication before any audience or wallet lookup', async () => {
  const api = createEndpoint([]);
  await assert.rejects(api.request({ userId: null }), { statusCode: 401 });
  assert.deepEqual(api.queries, []);
});
