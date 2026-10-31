import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import * as vue from 'vue';
import * as seasonAvailability from '../../lib/season-availability.ts';
import * as recapEligibility from '../../lib/recap-eligibility.ts';
import * as plainText from '../../lib/plain-text.ts';
import * as showCharacters from '../../lib/show-characters.ts';

const filename = 'pages/shows/[slug]/index.vue';
const source = readFileSync(new URL(`../../${filename}`, import.meta.url), 'utf8');
const { descriptor } = parse(source, { filename });
const script = compileScript(descriptor, { id: 'spoiler-shield-page-test' });
const compiled = ts.transpileModule(script.content.replaceAll('import.meta.client', 'true'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const entry = {
  slug: 'example-42', season: 2, episode: 2, spoilerShieldEnabled: true, updatedAt: '2026-01-01',
};
const plain = value => JSON.parse(JSON.stringify(value));

function hub(season, requestedCursor) {
  const throughEpisode = Math.min(6, requestedCursor);
  const events = [1, 5].filter(episode => episode <= throughEpisode).map(episode => ({
    id: `${season}-${episode}`, title: `Scene ${season}-${episode}`, description: 'A scene.',
    episodeNumbers: [episode], sceneIndex: 1, location: null, detail: null,
    characters: [`Character ${season}-${episode}`], arc: null, importance: 'major', confidence: 1, sources: [],
  }));
  return {
    season: { id: `season-${season}`, number: season },
    progress: { throughEpisode, totalEpisodes: 6, isComplete: throughEpisode === 6 },
    episodes: events.map(event => ({ number: event.episodeNumbers[0], title: event.title })),
    events,
    characters: events.map(event => ({
      id: event.id, name: event.characters[0], eventCount: 1,
      lastSeenEpisode: event.episodeNumbers[0], arcs: [],
      keyEvents: [{ id: event.id, title: event.title, episode: event.episodeNumbers[0] }],
    })),
    corrections: events.map(event => ({
      id: `correction-${event.id}`, revealEpisode: event.episodeNumbers[0],
      currentValue: event.title, proposedValue: `Corrected ${event.title}`,
    })),
  };
}

// Execute the actual page setup and event handlers with real Vue reactivity.
// Only Nuxt's lifecycle, composables and network boundaries are substituted.
async function createPage(t, {
  savedEntry = entry, userId = 'viewer-1', query = {}, seasons,
  eligibility = recapEligibility.recapEligibility('eligible'), eligibilityTransport,
} = {}) {
  const requests = [];
  const mutations = [];
  const notifications = [];
  const navigations = [];
  const replacements = [];
  const sources = new Map();
  const stops = [];
  const mounts = [];
  const unmounts = [];
  const generations = [];
  const infoNotices = [];
  let hubFailure = false;
  const route = { params: { slug: 'example-42' }, query, fullPath: '/shows/example-42' };
  const fetch = async (url, options = {}) => {
    requests.push({ url, options: plain(options) });
    if (options.method === 'PUT' || options.method === 'DELETE') {
      return new Promise((resolve, reject) => {
        mutations.push({ url, options: plain(options), resolve, reject });
      });
    }
    if (url === '/api/library/42') return { entry: savedEntry ? plain(savedEntry) : null };
    if (url === '/api/shows/42') return { show: {
      id: 'show-42', name: 'Example', summary: 'A show.', image: null,
      seasons: seasons ?? [1, 2, 3].map(number => ({
        id: `season-${number}`, number, first_aired: '2020-01-01', recap: [],
      })),
    } };
    if (url.endsWith('/eligibility')) return eligibilityTransport ? eligibilityTransport(url) : { eligibility };
    if (url === '/api/recap/keys') return { wallet: { keys: 2, unlimited: false }, followers: 0 };
    // Two recurring characters per season, each seen in that season only.
    if (url === '/api/shows/example-42/characters') return { characters: [1, 2, 3].flatMap(season => [1, 5].map(episode => ({
      name: `Character ${season}-${episode}`, actorName: `Actor ${season}-${episode}`, actorImageUrl: null,
      episodesBySeason: { [season]: 3 },
    }))) };
    const episodes = url.match(/\/seasons\/(\d+)\/episodes$/);
    if (episodes) return {
      seasonNumber: Number(episodes[1]), totalEpisodes: 6,
      episodes: Array.from({ length: 6 }, (_, index) => ({ number: index + 1, title: `Episode ${index + 1}` })),
    };
    const season = url.match(/\/seasons\/(\d+)$/);
    if (season) {
      if (hubFailure) throw new Error('Season hubs unavailable');
      return hub(Number(season[1]), options.query.throughEpisode);
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const watch = (...args) => {
    const stop = vue.watch(...args);
    stops.push(stop);
    return stop;
  };
  const module = { exports: {} };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    useI18n: () => ({ t: message => message, locale: vue.ref('en') }),
    useRoute: () => route,
    useRouter: () => ({ replace: target => {
      replacements.push(plain(target));
      return Promise.resolve();
    } }),
    useSupabaseUser: () => vue.ref(userId ? { sub: userId } : null),
    useIsAdmin: () => vue.ref(false),
    useRequestFetch: () => fetch,
    $fetch: fetch,
    useCookie: (_key, options) => vue.ref(options.default()),
    useRecapLanguages: () => ({ recapLanguages: vue.ref(['en']) }),
    useHead: () => {},
    navigateTo: target => { navigations.push(plain(target)); },
    localStorage: { getItem: () => null, removeItem: () => {} },
    useAsyncData: async (key, handler, options = {}) => {
      const state = { data: vue.ref(await handler()), pending: vue.ref(false), error: vue.ref(null) };
      state.refresh = async () => {
        state.pending.value = true;
        try {
          state.data.value = await handler();
          state.error.value = null;
        } catch (error) {
          // Keep previous data, as an async-data cache may after a failed refresh.
          state.error.value = error;
        } finally {
          state.pending.value = false;
        }
      };
      if (options.watch) watch(options.watch, state.refresh);
      sources.set(key, state);
      return state;
    },
    require: specifier => {
      if (specifier === 'vue') return {
        ...vue, watch, onMounted: callback => mounts.push(callback), onBeforeUnmount: callback => unmounts.push(callback), withAsyncContext: callback => [callback(), () => {}],
      };
      if (specifier === 'vue-sonner') return { toast: {
        error: message => notifications.push(message), success: () => {}, info: (...args) => infoNotices.push(plain(args)),
      } };
      if (specifier === '~/lib/season-availability') return seasonAvailability;
      if (specifier === '~/lib/recap-eligibility') return recapEligibility;
      if (specifier === '~/lib/plain-text') return plainText;
      if (specifier === '~/lib/show-characters') return showCharacters;
      if (specifier === '~/lib/recap-locales') return {
        recapLocales: ['fr', 'en'], recapLocaleNames: { fr: 'Français', en: 'English' }, recapLocaleFlags: {},
      };
      if (specifier === '~/lib/image-url') return { proxiedImageUrl: value => value };
      if (specifier === '~/composables/useRecapGenerations') return {
        useRecapGenerations: () => ({ generations: vue.ref({}), start: (...args) => generations.push(args) }),
        recapGenerationKey: (season, locale) => `${season}:${locale}`,
      };
      if (specifier === '~/composables/useStoryViewer') return { useStoryViewer: () => ({ openStory: () => {} }) };
      if (specifier === '~/composables/useRecapKeys') return {
        useRecapKeys: () => ({ wallet: vue.ref(null), refreshWallet: async () => {}, refreshRunning: async () => true }),
      };
      if (specifier === '~/composables/useRecapNotices') return {
        useRecapNotices: () => ({ askPermission: () => {}, notifyWhileHidden: () => false }),
      };
      if (specifier === 'lucide-vue-next' || specifier.startsWith('~/components/')) return {};
      throw new Error(`Unexpected show-page dependency: ${specifier}`);
    },
  }, { filename: 'show-page.compiled.cjs', timeout: 1000 });
  t.after(() => { unmounts.forEach(callback => callback()); stops.forEach(stop => stop()); });
  const page = await module.exports.default.setup({}, { expose: () => {} });
  return {
    page, requests, mutations, notifications, infoNotices, navigations, replacements, sources, generations,
    mount: async () => { mounts.forEach(callback => callback()); await settle(); },
    setEligibility: value => { eligibility = value; },
    failHubRefresh: () => { hubFailure = true; },
  };
}

async function settle() {
  for (let index = 0; index < 8; index += 1) await vue.nextTick();
}

function resolveSave(mutation, overrides = {}) {
  mutation.resolve({ entry: { ...entry, ...mutation.options.body, ...overrides } });
}

test('saved shield choice applies before the first season requests and survives a fresh page setup', async t => {
  const savedEntry = { ...entry, spoilerShieldEnabled: false };
  for (let visit = 0; visit < 2; visit += 1) {
    const { page, requests } = await createPage(t, { savedEntry });
    assert.equal(page.spoilerShieldEnabled.value, false);
    assert.deepEqual(requests.filter(request => /\/seasons\/\d+$/.test(request.url))
      .map(request => request.options.query.throughEpisode), [999, 999, 999]);
    assert.deepEqual([1, 2, 3].map(page.isRecapUnlocked), [true, true, true]);
    assert.equal(page.reachedSeasonNumber.value, 2);
    assert.equal(page.reachedEpisode.value, 2);
  }
});

test('shield defaults to enabled and limits each season and its recap to watched progress', async t => {
  const { page } = await createPage(t, { savedEntry: { ...entry, spoilerShieldEnabled: undefined } });
  assert.equal(page.spoilerShieldEnabled.value, true);
  assert.deepEqual([1, 2, 3].map(page.cursorForSeason), [999, 2, 0]);
  assert.deepEqual([1, 2, 3].map(page.isRecapUnlocked), [true, false, false]);
  page.reachedEpisode.value = 6;
  assert.equal(page.isRecapUnlocked(2), true);
});

test('toggling saves the preference without changing progress and ignores duplicate clicks during saving', async t => {
  const { page, mutations } = await createPage(t);
  const saving = page.toggleSpoilerShield();
  await page.toggleSpoilerShield();
  await settle();
  assert.equal(page.spoilerShieldEnabled.value, false);
  assert.equal(page.spoilerShieldSaving.value, true);
  assert.equal(mutations.length, 1);
  assert.deepEqual(mutations[0].options.body, {
    slug: 'example-42', season: 2, episode: 2, spoilerShieldEnabled: false,
  });
  assert.deepEqual([1, 2, 3].map(page.cursorForSeason), [999, 999, 999]);
  resolveSave(mutations[0]);
  await saving;
  assert.equal(page.spoilerShieldSaving.value, false);
  assert.equal(page.libraryEntry.value.spoilerShieldEnabled, false);
  assert.equal(page.reachedSeasonNumber.value, 2);
  assert.equal(page.reachedEpisode.value, 2);
});

test('reenabling immediately hides cached future characters even when refresh fails', async t => {
  const harness = await createPage(t, { savedEntry: { ...entry, spoilerShieldEnabled: false } });
  const { page, mutations } = harness;
  assert.equal(page.knownCharacterProfiles.value.length, 6);
  harness.failHubRefresh();
  const saving = page.toggleSpoilerShield();
  // Check before any async refresh can replace the cached, fully revealed hubs.
  assert.deepEqual(plain(page.visibleSeasonHubs.value.map(item => item.season.number)), [1]);
  // Characters go by season: up to season 2, where the viewer is, and none of season 3.
  assert.deepEqual(plain(page.knownCharacterProfiles.value.map(item => item.name)).sort(),
    ['Character 1-1', 'Character 1-5', 'Character 2-1', 'Character 2-5']);
  await settle();
  assert.equal(page.seasonHubs.value.length, 3);
  assert.equal(page.visibleSeasonHubs.value.length, 1);
  assert.equal(page.isRecapUnlocked(3), false);
  resolveSave(mutations[0]);
  await saving;
});

test('failed shield save restores the preference while a queued progress save preserves the newer episode', async t => {
  const { page, mutations, notifications } = await createPage(t);
  const saving = page.toggleSpoilerShield();
  page.markEpisodeSeen({ season: 2, episode: 3 });
  await settle();
  assert.equal(mutations.length, 1);
  mutations[0].reject(new Error('Database unavailable'));
  await saving;
  await settle();
  assert.equal(page.spoilerShieldEnabled.value, true);
  assert.equal(page.reachedEpisode.value, 3);
  assert.equal(page.spoilerShieldSaving.value, false);
  assert.deepEqual(notifications, ['Could not save your spoiler shield setting.']);
  assert.equal(mutations.length, 2);
  assert.deepEqual(mutations[1].options.body, { slug: 'example-42', season: 2, episode: 3 });
  resolveSave(mutations[1]);
  await settle();
  assert.equal(page.libraryEntry.value.episode, 3);
  assert.equal(page.libraryEntry.value.spoilerShieldEnabled, true);
});

test('an older progress response cannot overwrite a newer shield choice queued behind it', async t => {
  const { page, mutations } = await createPage(t);
  page.markEpisodeSeen({ season: 2, episode: 3 });
  const saving = page.toggleSpoilerShield();
  await settle();
  assert.equal(mutations.length, 1);
  assert.equal(page.libraryEntry.value.spoilerShieldEnabled, false);
  resolveSave(mutations[0], { spoilerShieldEnabled: true });
  await settle();
  assert.equal(page.spoilerShieldEnabled.value, false);
  assert.equal(page.libraryEntry.value.spoilerShieldEnabled, false);
  assert.equal(mutations.length, 2);
  assert.deepEqual(mutations[1].options.body, {
    slug: 'example-42', season: 2, episode: 3, spoilerShieldEnabled: false,
  });
  resolveSave(mutations[1]);
  await saving;
  const reloaded = await createPage(t, { savedEntry: plain(page.libraryEntry.value) });
  assert.equal(reloaded.page.spoilerShieldEnabled.value, false);
  assert.equal(reloaded.page.reachedEpisode.value, 3);
  assert.equal(reloaded.page.cursorForSeason(3), 999);
});

test('resetting and resuming progress preserve the saved disabled shield', async t => {
  const { page, mutations } = await createPage(t, { savedEntry: { ...entry, spoilerShieldEnabled: false } });
  page.resetProgress();
  await settle();
  assert.equal(page.spoilerShieldEnabled.value, false);
  assert.deepEqual(mutations[0].options.body, { slug: 'example-42', season: null, episode: 0 });
  resolveSave(mutations[0], { spoilerShieldEnabled: false });
  await settle();
  page.startTracking();
  await settle();
  assert.deepEqual(mutations[1].options.body, { slug: 'example-42', season: 1, episode: 0 });
  resolveSave(mutations[1], { spoilerShieldEnabled: false });
  await settle();
  assert.equal(page.spoilerShieldEnabled.value, false);
  assert.equal(page.libraryEntry.value.spoilerShieldEnabled, false);
  assert.equal(page.cursorForSeason(3), 999);
});

test('failed removal restores the saved shield, progress and progress URL', async t => {
  for (const spoilerShieldEnabled of [true, false]) {
    const savedEntry = { ...entry, spoilerShieldEnabled };
    const { page, mutations, replacements, notifications } = await createPage(t, {
      savedEntry, query: { season: '2', episode: '2', locale: 'fr' },
    });
    const removing = page.removeFromLibrary();
    assert.equal(page.libraryEntry.value, null);
    assert.equal(page.reachedSeasonNumber.value, 0);
    assert.equal(page.reachedEpisode.value, 0);
    await settle();
    assert.equal(mutations[0].options.method, 'DELETE');
    mutations[0].reject(new Error('Could not delete the entry'));
    await removing;
    assert.deepEqual(plain(page.libraryEntry.value), savedEntry);
    assert.equal(page.spoilerShieldEnabled.value, spoilerShieldEnabled);
    assert.equal(page.reachedSeasonNumber.value, 2);
    assert.equal(page.reachedEpisode.value, 2);
    assert.deepEqual(replacements.at(-1), { query: { season: 2, episode: 2, locale: 'fr' } });
    assert.equal(page.isRecapUnlocked(3), !spoilerShieldEnabled);
    assert.deepEqual(notifications, ['Could not update your library.']);
  }
});

test('failed toggle followed immediately by failed removal restores the persisted enabled shield', async t => {
  const { page, mutations, notifications } = await createPage(t);
  const saving = page.toggleSpoilerShield();
  const removing = page.removeFromLibrary();
  await settle();
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].options.method, 'PUT');
  assert.equal(page.spoilerShieldEnabled.value, false);
  assert.equal(page.reachedSeasonNumber.value, 2);
  mutations[0].reject(new Error('Could not save the preference'));
  await saving;
  await settle();
  assert.equal(mutations.length, 2);
  assert.equal(mutations[1].options.method, 'DELETE');
  mutations[1].reject(new Error('Could not delete the entry'));
  await removing;
  assert.equal(page.spoilerShieldEnabled.value, true);
  assert.equal(page.libraryEntry.value.spoilerShieldEnabled, true);
  assert.equal(page.spoilerShieldSaving.value, false);
  assert.equal(page.reachedSeasonNumber.value, 2);
  assert.equal(page.reachedEpisode.value, 2);
  assert.equal(page.cursorForSeason(2), 2);
  assert.equal(page.isRecapUnlocked(3), false);
  assert.deepEqual(notifications, ['Could not save your spoiler shield setting.', 'Could not update your library.']);
});

test('guest must sign in before changing a persisted shield choice', async t => {
  const { page, mutations, navigations } = await createPage(t, { userId: null, savedEntry: null });
  await page.toggleSpoilerShield();
  assert.equal(page.spoilerShieldEnabled.value, true);
  assert.equal(mutations.length, 0);
  assert.deepEqual(navigations, [{ path: '/login', query: { redirect: '/shows/example-42' } }]);
});

test('recap cards retain published specials and missing dates without changing the episode tracker', async t => {
  const published = [{ id: 'recap', locale: 'en', status: 'published' }];
  const seasons = [
    { id: 'season-0', number: 0, first_aired: null, recap: published },
    { id: 'season-1', number: 1, first_aired: '2020-01-01', recap: [] },
    { id: 'season-2', number: 2, first_aired: null, recap: published },
    { id: 'season-3', number: 3, first_aired: '2999-01-01', recap: published },
    { id: 'season-4', number: 4, first_aired: '2999-01-01', recap: [] },
    { id: 'season-5', number: 5, first_aired: null, recap: [] },
  ];
  const { page } = await createPage(t, { seasons, savedEntry: null });
  assert.deepEqual(plain(page.seasonsChronological.value.map(season => season.number)), [1]);
  assert.deepEqual(plain(page.recapSeasons.value.map(season => season.number)), [0, 1, 2, 3, 4, 5]);
  assert.equal(page.withRecapsInLocale(page.recapSeasons.value[0]).recap[0].id, 'recap');
});

for (const code of ['season_in_progress', 'metadata_incomplete', 'availability_unavailable']) {
  test(`${code} refuses before the wallet dialog and can recover after a fresh check`, async t => {
    const blocked = recapEligibility.recapEligibility(code);
    const harness = await createPage(t, { eligibility: blocked });
    const { page, requests, generations, infoNotices } = harness;
    await page.generateRecap('season-1');
    assert.equal(page.unlockOpen.value, false);
    assert.equal(requests.some(request => request.url === '/api/recap/keys'), false);
    assert.equal(generations.length, 0);
    assert.equal(page.seasonEligibility.value['season-1'].code, code);
    assert.equal(infoNotices.at(-1)[1].description, blocked.message);
    harness.setEligibility(recapEligibility.recapEligibility('eligible'));
    await page.generateRecap('season-1');
    assert.equal(page.unlockOpen.value, true);
    assert.equal(requests.filter(request => request.url.endsWith('/eligibility')).length, 2);
    assert.equal(generations.length, 0, 'the wallet dialog still needs the viewer’s confirmation');
    await page.confirmUnlock();
    assert.deepEqual(generations, [['season-1', 'en']]);
  });
}

test('an eligibility network failure leaves the recap unavailable without opening the wallet', async t => {
  const { page, requests, generations } = await createPage(t, { eligibilityTransport: async () => { throw new Error('Offline'); } });
  await page.generateRecap('season-1');
  assert.equal(page.seasonEligibility.value['season-1'].code, 'availability_unavailable');
  assert.equal(page.unlockOpen.value, false);
  assert.equal(requests.some(request => request.url === '/api/recap/keys'), false);
  assert.equal(generations.length, 0);
});

test('prefetch limits concurrent checks and skips the published recap in the selected language', async t => {
  const checks = [];
  const seasons = Array.from({ length: 6 }, (_, index) => ({
    id: `season-${index + 1}`, number: index + 1, first_aired: '2020-01-01',
    recap: index === 0 ? [{ id: 'published', locale: 'en', status: 'published' }] : [],
  }));
  const { page, mount } = await createPage(t, {
    seasons,
    eligibilityTransport: url => new Promise(resolve => checks.push({ url, resolve })),
  });
  await mount();
  assert.equal(checks.length, 3);
  assert.ok(checks.every(check => !check.url.includes('/seasons/1/')));
  checks[0].resolve({ eligibility: recapEligibility.recapEligibility('eligible') });
  await settle();
  assert.equal(checks.length, 4);
  checks.slice(1).forEach(check => check.resolve({ eligibility: recapEligibility.recapEligibility('eligible') }));
  await settle();
  assert.equal(checks.length, 5);
  checks[4].resolve({ eligibility: recapEligibility.recapEligibility('eligible') });
  await settle();
  assert.equal(Object.keys(page.seasonEligibility.value).length, 5);
});
