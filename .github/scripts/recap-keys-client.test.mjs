import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import * as vue from 'vue';
import * as progress from '../../lib/recap-generation-progress.ts';
import { recapEligibility, RECAP_ELIGIBILITY_MESSAGES } from '../../lib/recap-eligibility.ts';
import { showMessages } from '../../lib/i18n/shows.ts';

const root = new URL('../../', import.meta.url);
const plain = value => JSON.parse(JSON.stringify(value));
const wallet = (keys, points = 0) => ({ keys, points, maxKeys: 5, keyProgress: points % 10, pointsPerKey: 10, unlimited: false });
const job = (overrides = {}) => ({
  id: 'job-1', seasonId: 'season-1', status: 'generating', phase: 'writing_story', progress: 65,
  locale: 'fr', recapId: null, keyState: 'reserved', keyRefunded: false,
  stageStartedAt: new Date().toISOString(), serverNow: new Date().toISOString(),
  showName: 'Example', showPath: '/shows/example-42', seasonNumber: 1, ...overrides,
});
const notice = { jobId: 'job-1', ready: true, recapId: 'recap-1', keyRefunded: false, showName: 'Example', seasonNumber: 1 };
async function settle() { for (let i = 0; i < 12; i += 1) await vue.nextTick(); }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

function load(relative, globals, dependencies) {
  let source = readFileSync(new URL(relative, root), 'utf8');
  if (relative.endsWith('.vue')) source = compileScript(parse(source, { filename: relative }).descriptor, { id: relative }).content;
  const compiled = ts.transpileModule(source.replaceAll('import.meta.client', 'false'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(compiled, {
    module, exports: module.exports, ...globals,
    require: specifier => {
      if (specifier in dependencies) return dependencies[specifier];
      if (specifier === 'lucide-vue-next' || specifier.startsWith('~/components/')) return {};
      throw new Error(`Unexpected dependency: ${specifier}`);
    },
  }, { filename: relative });
  return module.exports;
}

function context(t, fetch) {
  const user = vue.ref({ sub: 'owner' });
  const states = new Map();
  const mounts = [];
  const unmounts = [];
  const stops = [];
  const timers = new Map();
  const toasts = [];
  let timerId = 0;
  const watch = (...args) => { const stop = vue.watch(...args); stops.push(stop); return stop; };
  const globals = {
    ...vue, watch,
    console: { warn() {}, error() {} },
    onMounted: callback => mounts.push(callback), onBeforeUnmount: callback => unmounts.push(callback),
    useSupabaseUser: () => user,
    useState: (key, init) => { if (!states.has(key)) states.set(key, vue.ref(init())); return states.get(key); },
    $fetch: (...args) => fetch(...args),
    useI18n: () => ({ t: message => message, preference: vue.ref('en') }),
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
  };
  const dependencies = {
    vue: { ...vue, useId: () => 'test-component', watch, onMounted: globals.onMounted, onBeforeUnmount: globals.onBeforeUnmount },
    '~/lib/recap-generation-progress': progress,
    '~/composables/useStoryViewer': { useStoryViewer: () => ({ openStory() {} }) },
    '~/composables/useRecapNotices': { useRecapNotices: () => ({ notifyWhileHidden: () => false }) },
    'vue-sonner': { toast: { success: (...args) => toasts.push(['success', ...args]), error: (...args) => toasts.push(['error', ...args]) } },
  };
  const { useRecapKeys } = load('composables/useRecapKeys.ts', globals, dependencies);
  dependencies['~/composables/useRecapKeys'] = { useRecapKeys };
  const keys = useRecapKeys();
  t.after(() => { unmounts.forEach(callback => callback()); stops.forEach(stop => stop()); });
  return {
    user, keys, states, timers, toasts, globals, dependencies,
    mount: async () => { mounts.forEach(callback => callback()); await settle(); },
    load: relative => load(relative, globals, dependencies),
    nextTimer: async () => {
      assert.ok(timers.size, 'expected a scheduled retry or poll');
      const [id, timer] = timers.entries().next().value;
      timers.delete(id); timer.callback(); await settle();
    },
  };
}

for (const [name, cause] of [
  ['a lost response after reservation', new TypeError('Failed to fetch')],
  ['a server failure before reservation', { statusCode: 500 }],
  ['a free admin generation failure', { statusCode: 422 }],
]) {
  test(`does not promise a refund for ${name}`, async t => {
    const state = context(t, async () => { throw cause; });
    const { useRecapGenerations } = state.load('composables/useRecapGenerations.ts');
    let failure;
    const generations = useRecapGenerations({ showId: () => 'show-1', onCompleted() {}, onFailed: (_key, _message, value) => { failure = value; } });
    await generations.start('season-1', 'fr');
    assert.deepEqual(plain(failure), { noKeys: false, keyRefunded: false });
  });
}

for (const errorData of [{ keyRefunded: true }, { data: { keyRefunded: true } }]) {
  test(`shows a refund only when the start error confirms it: ${JSON.stringify(errorData)}`, async t => {
    const state = context(t, async () => { throw { statusCode: 422, data: errorData }; });
    const { useRecapGenerations } = state.load('composables/useRecapGenerations.ts');
    let failure;
    const generations = useRecapGenerations({ showId: () => 'show-1', onCompleted() {}, onFailed: (_key, _message, value) => { failure = value; } });
    await generations.start('season-1', 'fr');
    assert.equal(failure.keyRefunded, true);
  });
}

test('keeps the missing-key response distinct from refunds', async t => {
  const state = context(t, async () => { throw { statusCode: 402, data: { data: { code: 'no_recap_keys' } } }; });
  const { useRecapGenerations } = state.load('composables/useRecapGenerations.ts');
  let failure;
  const generations = useRecapGenerations({ showId: () => 'show-1', onCompleted() {}, onFailed: (_key, _message, value) => { failure = value; } });
  await generations.start('season-1', 'fr');
  assert.deepEqual(plain(failure), { noKeys: true, keyRefunded: false });
  assert.deepEqual(plain(generations.generations.value), {});
});

for (const code of ['season_in_progress', 'metadata_incomplete', 'availability_unavailable', 'insufficient_sources', 'finale_source_missing', 'source_rights_restricted']) {
  test(`an eligibility refusal (${code}) leaves no failed job to retry and promises no refund`, async t => {
    const eligibility = recapEligibility(code);
    const state = context(t, async () => { throw { statusCode: 422, data: { data: { code: 'recap_ineligible', eligibility } } }; });
    const { useRecapGenerations } = state.load('composables/useRecapGenerations.ts');
    let failure, message;
    const generations = useRecapGenerations({ showId: () => 'show-1', onCompleted() {}, onFailed: (_key, text, value) => { failure = value; message = text; } });
    await generations.start('season-1', 'fr');
    assert.deepEqual(plain(failure), { noKeys: false, keyRefunded: false, eligibility });
    assert.equal(message, eligibility.message);
    assert.deepEqual(plain(generations.generations.value), {});
  });
}

test('all eligibility refusal reasons have a French translation', () => {
  for (const message of Object.values(RECAP_ELIGIBILITY_MESSAGES)) {
    assert.ok(showMessages[message], `Missing translation: ${message}`);
    assert.notEqual(showMessages[message], message);
  }
});

test('an existing published recap remains playable while new creation is ineligible or unchecked', t => {
  const state = context(t, async () => {});
  state.globals.useI18n = () => ({ t: message => message });
  const component = state.load('components/SeasonStory.vue').default;
  const emitted = [];
  const props = vue.reactive({
    season: { id: 'season-1', number: 1, recap: [{ id: 'recap-1', status: 'published' }] },
    isAdmin: false, isGenerating: false, isLatest: false, spoilerLocked: false,
    eligibilityPending: true, eligibility: recapEligibility('metadata_incomplete'),
  });
  const card = component.setup(props, { expose() {}, emit: (...args) => emitted.push(args) });
  assert.equal(card.primaryDisabled.value, false);
  assert.equal(card.statusLabel.value, 'Available');
  card.handlePrimaryAction();
  assert.deepEqual(emitted, [['view', 'recap-1']]);
  props.spoilerLocked = true;
  card.handlePrimaryAction();
  assert.equal(emitted.length, 1, 'availability must not bypass the viewer’s spoiler shield');
});

test('an ineligible season explains its state and can request a fresh check', t => {
  const state = context(t, async () => {});
  const emitted = [];
  const component = state.load('components/SeasonStory.vue').default;
  const props = vue.reactive({
    season: { id: 'season-1', number: 1, recap: [] },
    isAdmin: false, isGenerating: false, isLatest: false, spoilerLocked: false,
    eligibilityPending: false, eligibility: recapEligibility('season_in_progress'),
  });
  const card = component.setup(props, { expose() {}, emit: (...args) => emitted.push(args) });
  assert.equal(card.statusLabel.value, 'Still airing');
  card.handlePrimaryAction();
  assert.deepEqual(emitted, [['generate', 'season-1']]);
  props.eligibilityPending = true;
  assert.equal(card.primaryDisabled.value, true);
  assert.equal(card.statusLabel.value, 'Checking availability');
});

for (const keyRefunded of [true, false]) {
  test(`resumed jobs use the server's viewer-specific refund (${keyRefunded})`, async t => {
    const state = context(t, async url => url.endsWith('/active')
      ? { jobs: [job()] }
      : job({ status: 'failed', keyState: 'refunded', keyRefunded }));
    const { useRecapGenerations } = state.load('composables/useRecapGenerations.ts');
    let failure;
    useRecapGenerations({ showId: () => 'show-1', onCompleted() {}, onFailed: (_key, _message, value) => { failure = value; } });
    await state.mount();
    assert.equal(failure.keyRefunded, keyRefunded);
  });
}

test('profile follows the shared wallet and reloads unlocked recaps after a job finishes', async t => {
  let currentWallet = wallet(2);
  let jobs = [job()];
  let unlocked = [];
  let unlockedRequests = 0;
  const state = context(t, async url => {
    if (url === '/api/recap/keys') return { wallet: currentWallet };
    if (url === '/api/recap/generation/mine') return { jobs };
    throw new Error(url);
  });
  Object.assign(state.globals, {
    useLanguagePreference: () => ({ saving: vue.ref(false), saveLanguagePreference() {} }),
    useRecapLanguages: () => ({ recapLanguages: vue.ref(['en']), saving: vue.ref(false), saveRecapLanguages() {} }),
    useSupabaseClient: () => ({}), useRouter: () => ({}),
    useFetch: (url, options = {}) => {
      const data = vue.ref(null);
      const refresh = () => {
        if (url === '/api/user/unlocked-recaps') { unlockedRequests += 1; data.value = unlocked; }
        else data.value = [];
      };
      refresh();
      if (options.watch) state.globals.watch(options.watch, refresh);
      return { data, pending: vue.ref(false), error: vue.ref(null) };
    },
  });
  state.dependencies['~/lib/recap-locales'] = { recapLocales: ['en', 'fr'], recapLocaleNames: {} };
  const profile = state.load('pages/profile.vue').default.setup({}, { expose() {} });
  await state.keys.refreshRunning();
  await state.mount();
  assert.equal(profile.keys.value.wallet.keys, 2);
  currentWallet = wallet(3);
  jobs = [];
  unlocked = [{ id: 'recap-1', views: 0 }];
  await state.keys.refreshRunning();
  await state.keys.refreshWallet();
  await settle();
  assert.equal(profile.keys.value.wallet.keys, 3);
  assert.deepEqual(plain(profile.unlockedRecaps.value), unlocked);
  const beforePoints = unlockedRequests;
  currentWallet = wallet(4, 10);
  unlocked = [{ id: 'recap-1', views: 10 }];
  await state.keys.refreshWallet();
  await settle();
  assert.equal(profile.keys.value.wallet.points, 10);
  assert.ok(unlockedRequests > beforePoints);
  assert.equal(profile.unlockedRecaps.value[0].views, 10);
});

test('checks notices after discovering jobs, so a completion during startup is not lost', async t => {
  const mine = deferred();
  const reads = [];
  let terminal = false;
  const state = context(t, async url => {
    reads.push(url);
    if (url.endsWith('/mine')) return mine.promise;
    if (url.endsWith('/keys')) return { wallet: wallet(2) };
    if (url.endsWith('/notices')) return { notices: terminal ? [notice] : [] };
    throw new Error(url);
  });
  state.load('components/RecapNotices.vue').default.setup({}, { expose() {} });
  await state.mount();
  assert.deepEqual(reads, ['/api/recap/generation/mine']);
  terminal = true;
  mine.resolve({ jobs: [] });
  await settle();
  assert.equal(state.toasts.length, 1);
  assert.equal(state.toasts[0][0], 'success');
  assert.equal(state.keys.completedVersion.value, 1, 'invalidate the profile even if this visit never saw an active job');
  assert.equal(state.timers.size, 0);
});

test('retries a failed notice read even when no generation remains active', async t => {
  let attempts = 0;
  const state = context(t, async url => {
    if (url.endsWith('/mine')) return { jobs: [] };
    if (url.endsWith('/keys')) return { wallet: wallet(3) };
    if (url.endsWith('/notices')) {
      if (++attempts === 1) throw new Error('offline');
      return { notices: [notice] };
    }
    throw new Error(url);
  });
  state.load('components/RecapNotices.vue').default.setup({}, { expose() {} });
  await state.mount();
  assert.equal(state.toasts.length, 0);
  await state.nextTimer();
  assert.equal(attempts, 2);
  assert.equal(state.toasts.length, 1);
  assert.equal(state.timers.size, 0);
});

test('a completion discovered by another consumer refreshes the wallet and notices', async t => {
  let active = true;
  let notified = false;
  const state = context(t, async url => {
    if (url.endsWith('/mine')) return { jobs: active ? [job()] : [] };
    if (url.endsWith('/keys')) return { wallet: wallet(active ? 2 : 3) };
    if (url.endsWith('/notices')) {
      const notices = !active && !notified ? [{ ...notice, ready: false, keyRefunded: true }] : [];
      if (notices.length) notified = true;
      return { notices };
    }
    throw new Error(url);
  });
  state.load('components/RecapNotices.vue').default.setup({}, { expose() {} });
  await state.mount();
  assert.equal(state.keys.wallet.value.keys, 2);
  active = false;
  await state.keys.refreshRunning();
  await settle();
  assert.equal(state.keys.wallet.value.keys, 3);
  assert.equal(state.toasts.length, 1);
    assert.match(state.toasts[0][2].description, /Your ticket was given back/);
});

test('late wallet responses cannot restore another account’s balance after logout', async t => {
  const response = deferred();
  const state = context(t, async () => response.promise);
  const reading = state.keys.refreshWallet();
  state.user.value = null;
  state.keys.clear();
  response.resolve({ wallet: wallet(5) });
  await reading;
  assert.equal(state.keys.wallet.value, null);
});

for (const [viewer, keyState, expected] of [
  ['owner', 'refunded', true],
  ['follower', 'refunded', false],
  ['owner', 'none', false],
  ['owner', 'spent', false],
]) {
  test(`job endpoint confirms only this viewer’s actual refund: ${viewer}/${keyState}`, async t => {
    const state = context(t, async () => {});
    state.user.value = { sub: viewer };
    const stored = { id: 'job-1', requested_by: 'owner', key_state: keyState, requester_notified_at: 'already-acknowledged' };
    const service = {
      from() {
        let update;
        const conditions = [];
        const query = {
          select() { return query; },
          update(patch) { update = patch; return query; },
          eq(key, value) { conditions.push(row => row[key] === value); return query; },
          is(key, value) { conditions.push(row => row[key] === value); return query; },
          maybeSingle: execute,
          then: (resolve, reject) => execute().then(resolve, reject),
        };
        async function execute() {
          const matches = conditions.every(condition => condition(stored));
          if (update && matches) Object.assign(stored, update);
          return { data: matches ? { id: stored.id } : null, error: null };
        }
        return query;
      },
    };
    const handler = load('server/api/recap/generation/[id].get.ts', {
      defineEventHandler: fn => fn,
      createError: options => Object.assign(new Error(options.statusMessage), options),
    }, {
      '#supabase/server': { serverSupabaseUser: async () => state.user.value, serverSupabaseServiceRole: () => service },
      '~/lib/recap-generation-progress': progress,
      '~/server/services/recap-generation-runner': { advanceRecapGenerationJob: async () => job({ status: 'failed', keyState }) },
    }).default;
    const response = await handler({ context: { params: { id: 'job-1' } } });
    assert.equal(response.keyRefunded, expected);
    assert.equal(stored.requester_notified_at, 'already-acknowledged');
  });
}
