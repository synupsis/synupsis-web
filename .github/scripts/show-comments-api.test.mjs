import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const compile = path => ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const routeCode = compile('server/api/shows/[slug]/comments.get.ts');
const mapperCode = compile('server/utils/episode-comments.ts');
const createError = details => Object.assign(new Error(details.statusMessage), details);

function comment(id, day, overrides = {}) {
  return { id, show_id: 'show', user_id: 'author', parent_id: null, season: 1, episode: 1,
    author_name: 'Author', author_avatar_url: null, body: `Comment ${id}`, is_spoiler: false,
    created_at: `2026-10-${String(day).padStart(2, '0')}T12:00:00Z`, likes: [], replies: [], ...overrides };
}

// The in-memory transport applies the route's database filters, ordering and
// inclusive ranges. Popularity ordering itself is tested against PostgreSQL.
function feed(rows, { rankedIds = [], error = null } = {}) {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: rankedIds.slice(args.p_offset, args.p_offset + args.p_limit).map(id => ({ id })), error };
    },
    from(table) {
      assert.equal(table, 'episode_comment');
      const filters = [], orders = [];
      let from = 0, to = Infinity;
      const query = {
        select() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        is(key, value) { filters.push(row => row[key] === value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        order(key, { ascending }) { orders.push([key, ascending]); return query; },
        range(first, last) { from = first; to = last; return query; },
        then(resolve, reject) {
          const data = rows.filter(row => row.visible !== false && filters.every(filter => filter(row)))
            .sort((a, b) => {
              for (const [key, ascending] of orders) {
                const result = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
                if (result) return ascending ? result : -result;
              }
              return 0;
            }).slice(from, to + 1);
          return Promise.resolve({ data, error }).then(resolve, reject);
        },
      };
      calls.push({ table });
      return query;
    },
  };
  const mapper = { exports: {} };
  runInNewContext(mapperCode, { module: mapper, exports: mapper.exports,
    require: () => ({}), createError }, { timeout: 1000 });
  const route = { exports: {} };
  runInNewContext(routeCode, {
    module: route, exports: route.exports, defineEventHandler: handler => handler,
    getQuery: event => event.query, createError,
    require: () => ({ ...mapper.exports, resolveShowForComments: async event => {
      if (!event.signedIn) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
      return { client, user: { sub: 'viewer' }, showId: 'show' };
    } }),
  }, { timeout: 1000 });
  return { calls, request: async (query = {}, signedIn = true) => structuredClone(await route.exports.default({ query, signedIn })) };
}

test('supports newest and oldest, with stable ties independent of likes', async () => {
  const api = feed([comment('b', 2), comment('old', 1, { likes: [{ user_id: 'viewer' }] }), comment('a', 2)]);
  assert.deepEqual((await api.request({ sort: 'newest' })).comments.map(row => row.comment.id), ['a', 'b', 'old']);
  assert.deepEqual((await api.request({ sort: 'oldest' })).comments.map(row => row.comment.id), ['old', 'a', 'b']);
});

test('episode order follows seasons then episodes, with newest discussions inside each episode', async () => {
  const api = feed([
    comment('season-two', 4, { season: 2 }), comment('episode-two', 3, { episode: 2 }),
    comment('older', 1), comment('newer', 2),
  ]);
  assert.deepEqual((await api.request({ sort: 'episode' })).comments.map(row => row.comment.id), ['newer', 'older', 'episode-two', 'season-two']);
});

for (const sort of ['newest', 'oldest', 'episode']) {
  test(`${sort} applies page boundaries after ordering and excludes replies, hidden and foreign comments`, async () => {
    const rows = Array.from({ length: 41 }, (_, index) => comment(`id-${String(index).padStart(2, '0')}`, 1));
    const api = feed([...rows, comment('reply', 3, { parent_id: 'id-00' }), comment('foreign', 3, { show_id: 'other' }), comment('spoiler', 3, { visible: false })]);
    const pages = await Promise.all([0, 20, 40, 41].map(offset => api.request({ sort, offset })));
    assert.deepEqual(pages.map(page => [page.comments.length, page.hasMore]), [[20, true], [20, true], [1, false], [0, false]]);
    assert.deepEqual(pages.flatMap(page => page.comments.map(row => row.comment.id)), rows.map(row => row.id));
  });
}

test('defaults to most-liked, preserving database rank after hydration and using a lookahead row', async () => {
  const rows = Array.from({ length: 21 }, (_, index) => comment(`id-${index}`, 1));
  const rankedIds = rows.map(row => row.id).reverse();
  const api = feed(rows, { rankedIds });
  const first = await api.request();
  assert.deepEqual(first.comments.map(row => row.comment.id), rankedIds.slice(0, 20));
  assert.equal(first.hasMore, true);
  const last = await api.request({ sort: 'most-liked', offset: 20 });
  assert.deepEqual(last.comments.map(row => row.comment.id), rankedIds.slice(20));
  assert.equal(last.hasMore, false);
});

test('rejects invalid inputs and anonymous requests without querying comments', async () => {
  const api = feed([]);
  for (const query of [{ sort: 'invalid' }, { sort: ['newest', 'oldest'] }, { offset: -1 }, { offset: 0.5 }, { offset: 'bad' }, { offset: 2 ** 31 }]) {
    await assert.rejects(api.request(query), { statusCode: 400 });
  }
  await assert.rejects(api.request({}, false), { statusCode: 401 });
  assert.equal(api.calls.length, 0);
});

test('handles empty feeds and database failures without leaking private details', async () => {
  for (const sort of ['newest', 'most-liked']) {
    assert.deepEqual(await feed([]).request({ sort }), { comments: [], hasMore: false });
    await assert.rejects(feed([], { error: { message: 'private details' } }).request({ sort }), {
      statusCode: 500, message: 'Could not load the comments.',
    });
  }
});
