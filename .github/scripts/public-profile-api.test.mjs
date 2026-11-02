import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const compile = path => ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const createError = details => Object.assign(new Error(details.statusMessage), details);
const load = (path, globals, modules) => {
  const module = { exports: {} };
  runInNewContext(compile(path), {
    module, exports: module.exports, createError, console: { error() {} }, ...globals,
    require: specifier => {
      if (specifier in modules) return modules[specifier];
      throw new Error(`Unexpected dependency: ${specifier}`);
    },
  }, { timeout: 1000 });
  return module.exports;
};
const profileLib = load('lib/public-profile.ts', {}, {});
const showPathLib = load('lib/show-path.ts', {}, {});

// Applies the filters the routes use, so a missing one shows up as leaked rows.
function table(rows, calls, name) {
  const filters = [];
  let limit = 1000;
  let countExact = false;
  let head = false;
  const valueAt = (row, key) => key.split('.').reduce((value, part) => value?.[part], row);
  const query = {
    select(_columns, options = {}) { countExact = options.count === 'exact'; head = options.head === true; return query; },
    eq(key, value) { filters.push(row => valueAt(row, key) === value); return query; },
    neq(key, value) { filters.push(row => valueAt(row, key) !== value); return query; },
    not(key, operator, value) { assert.equal(operator, 'is'); filters.push(row => valueAt(row, key) !== value); return query; },
    in(key, values) { filters.push(row => values.includes(row[key])); return query; },
    order() { return query; },
    limit(count) { limit = count; return query; },
    maybeSingle() { limit = 1; query.single = true; return query; },
    then(resolve, reject) {
      calls.push(name);
      const matches = rows.filter(row => filters.every(filter => filter(row)));
      const data = matches.slice(0, limit);
      return Promise.resolve({ data: head ? null : query.single ? data[0] ?? null : data,
        count: countExact ? matches.length : null, error: null }).then(resolve, reject);
    },
  };
  return query;
}

const show = { name: 'Séverance', trakt_id: 42 };
const comment = (id, overrides = {}) => ({
  id, user_id: 'owner', author_name: 'Léa', season: 1, episode: 2, parent_id: null, is_spoiler: false,
  spoiler_report_count: 0, created_at: `2026-10-0${id.length % 9 + 1}T12:00:00Z`, show, likes: [{ count: 3 }], body: `Body ${id}`,
  ...overrides,
});
const suggestion = (id, overrides = {}) => ({
  id, created_by: 'owner', author_name: 'Léa', kind: 'text', status: 'accepted', created_at: '2026-10-05T12:00:00Z',
  recap: { id: 'recap-1', status: 'published', show, season: { number: 1 } }, likes: [{ count: 1 }], ...overrides,
});

function profile({ recaps = [], views = [], comments = [], suggestions = [] } = {}) {
  const calls = [];
  const tables = {
    recap: recaps.map(recap => ({ ...recap, recap_view: [{ count: views.filter(view => view.recap_id === recap.id).length }] })),
    recap_view: views.map(view => ({ ...view, recap: recaps.find(recap => recap.id === view.recap_id) })),
    episode_comment: comments,
    recap_slide_suggestion: suggestions,
  };
  const service = { from: name => table(tables[name], calls, name) };
  const route = load('server/api/users/[handle].get.ts', { defineEventHandler: handler => handler }, {
    '#supabase/server': { serverSupabaseServiceRole: () => service },
    '~/lib/show-path': showPathLib,
    '~/server/utils/public-profile': { resolvePublicProfile: async () => ({ userId: 'owner', profile: { handle: 'lea' } }) },
  });
  return { request: async () => structuredClone(await route.default({})) };
}

test('counts all public recaps and their views independently of the displayed list', async () => {
  const recap = (id, overrides = {}) => ({ id, unlocked_by: 'owner', unlocked_by_name: 'Léa',
    locale: 'fr', created_at: '2026-11-01T12:00:00Z', status: 'published', is_canonical: true,
    show, season: { number: 1, image: null }, ...overrides });
  const publicRecaps = Array.from({ length: 101 }, (_, index) => recap(`recap-${index}`));
  const recaps = [...publicRecaps,
    recap('anonymous', { unlocked_by_name: null }),
    recap('draft', { status: 'draft' }),
    recap('superseded', { is_canonical: false }),
    recap('someone-else', { unlocked_by: 'other' }),
  ];
  // Over 1,000 view rows, including the owner's views, and views of excluded recaps.
  const views = recaps.flatMap(recap => ['owner', ...Array.from({ length: 11 }, (_, i) => `visitor-${i}`)]
    .map(user_id => ({ recap_id: recap.id, user_id })));
  const api = profile({ recaps, views, comments: [comment('named'), comment('anonymous', { author_name: null })],
    suggestions: [suggestion('accepted'), suggestion('rejected', { status: 'rejected' })] });
  const result = await api.request();
  assert.deepEqual(result.stats, { recaps: 101, views: 1111, comments: 1, acceptedSuggestions: 1 });
  assert.equal(result.recaps.length, 100);
  assert.ok(result.recaps.every(recap => recap.views === 11), 'the displayed recaps also exclude their owner’s views');
});

test('returns zero totals for a profile with no public contributions', async () => {
  const result = await profile().request();
  assert.deepEqual(result.stats, { recaps: 0, views: 0, comments: 0, acceptedSuggestions: 0 });
  assert.deepEqual(result.recaps, []);
});

function activity({ viewer = null, readable = [], comments = [], suggestions = [] }) {
  const calls = [];
  const service = { from: name => table(name === 'episode_comment' ? comments : suggestions, calls, `service:${name}`) };
  const client = { from: name => table(comments.filter(row => readable.includes(row.id)), calls, `viewer:${name}`) };
  const route = load('server/api/users/[handle]/activity.get.ts', { defineEventHandler: handler => handler }, {
    '#supabase/server': { serverSupabaseServiceRole: () => service },
    '~/lib/show-path': showPathLib,
    '~/server/utils/episode-comments': { SPOILER_REPORT_THRESHOLD: 2 },
    '~/server/utils/public-profile': { resolvePublicProfile: async () => ({ client, viewer, userId: 'owner' }) },
  });
  return { calls, request: async () => structuredClone(await route.default({})) };
}

test('anonymous visitors see where a viewer commented, never what they wrote', async () => {
  const api = activity({ comments: [comment('a'), comment('bb')] });
  const { items } = await api.request();
  assert.deepEqual(items.map(item => [item.id, item.body]), [['bb', null], ['a', null]]);
  assert.equal(items[0].showPath, '/shows/severance-42');
  assert.equal(items[0].likeCount, 3);
  assert.ok(!api.calls.includes('viewer:episode_comment'));
});

test('a signed-in visitor reads only the comments their own progress unlocks', async () => {
  const api = activity({ viewer: { sub: 'visitor' }, readable: ['a'], comments: [comment('a'), comment('bb', { episode: 9 })] });
  const { items } = await api.request();
  assert.deepEqual(Object.fromEntries(items.map(item => [item.id, item.body])), { a: 'Body a', bb: null });
});

test('leaves out anonymous contributions, declined suggestions and unpublished recaps', async () => {
  const api = activity({
    comments: [comment('named'), comment('quiet', { author_name: null }), comment('other', { user_id: 'someone' })],
    suggestions: [
      suggestion('kept'),
      suggestion('pending', { status: 'pending', kind: 'add' }),
      suggestion('declined', { status: 'rejected' }),
      suggestion('anonymous', { author_name: null }),
      suggestion('draft', { recap: { id: 'recap-2', status: 'draft', show, season: { number: 1 } } }),
    ],
  });
  const { items } = await api.request();
  assert.deepEqual(items.map(item => item.id).sort(), ['kept', 'named', 'pending']);
  const kept = items.find(item => item.id === 'kept');
  assert.deepEqual([kept.kind, kept.suggestionKind, kept.status, kept.recapId], ['suggestion', 'text', 'accepted', 'recap-1']);
  assert.ok(!('proposed_value' in kept) && !('message' in kept), 'a suggestion text could spoil the season');
});

test('marks comments reported as spoilers and replies', async () => {
  const api = activity({ comments: [comment('reported', { spoiler_report_count: 2 }), comment('reply', { parent_id: 'x' })] });
  const items = Object.fromEntries((await api.request()).items.map(item => [item.id, item]));
  assert.equal(items.reported.isSpoiler, true);
  assert.equal(items.reply.isReply, true);
  assert.equal(items.reply.isSpoiler, false);
});

function save({ body }) {
  const calls = [];
  const updates = [];
  const metadataUpdates = [];
  const client = {
    auth: { updateUser: async payload => { metadataUpdates.push(payload); return { error: null }; } },
    from: () => {
      const query = table([{ user_id: 'owner', handle: 'lea', display_name: 'Léa', bio: null }], calls, 'viewer:public_profile');
      query.update = changes => { updates.push(changes); return query; };
      return query;
    },
  };
  const route = load('server/api/user/profile.put.ts', { defineEventHandler: handler => handler, readBody: async () => body }, {
    '#supabase/server': { serverSupabaseClient: async () => client },
    '~/lib/public-profile': profileLib,
    '~/server/utils/require-admin': { requireAuthenticatedUser: async () => ({ sub: 'owner', user_metadata: { username: 'Stale' } }) },
  });
  // Objects built inside the route's context: compare plain copies.
  return { updates, metadataUpdates, plain: value => JSON.parse(JSON.stringify(value)), request: () => route.default({}) };
}

test('saves the name and bio without requiring an address', async () => {
  const api = save({ body: { displayName: ' Léa M. ', bio: ' Polars. ' } });
  const result = await api.request();
  assert.deepEqual(api.plain(api.metadataUpdates), [{ data: { username: 'Léa M.' } }]);
  assert.deepEqual(api.plain(api.updates), [{ bio: 'Polars.' }]);
  assert.equal(result.handle, 'lea');
});

test('keeps the saved name, whatever the session says, and clears an empty bio', async () => {
  const api = save({ body: { displayName: 'Léa', bio: '' } });
  await api.request();
  assert.deepEqual(api.metadataUpdates, []);
  assert.deepEqual(api.plain(api.updates), [{ bio: null }]);
});

test('ignores supplied addresses so callers cannot change the public URL', async () => {
  for (const handle of ['taken', 'not valid', '', null]) {
    const api = save({ body: { displayName: 'Other', handle, bio: '' } });
    const result = await api.request();
    assert.deepEqual(api.plain(api.metadataUpdates), [{ data: { username: 'Other' } }]);
    assert.deepEqual(api.plain(api.updates), [{ bio: null }]);
    assert.equal(result.handle, 'lea');
  }
});

test('rejects invalid profiles', async () => {
  for (const body of [
    null,
    { displayName: 'Léa' },
    { displayName: '   ', bio: '' },
    { displayName: 'x'.repeat(81), bio: '' },
    { displayName: 'Léa', bio: 'x'.repeat(161) },
  ]) {
    await assert.rejects(save({ body }).request(), { statusCode: 400 }, JSON.stringify(body));
  }
});
