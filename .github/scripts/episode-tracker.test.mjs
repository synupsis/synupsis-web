import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import * as vue from 'vue';
import * as watchingProgress from '../../lib/watching-progress.ts';

const filename = 'components/EpisodeTracker.vue';
const source = readFileSync(new URL(`../../${filename}`, import.meta.url), 'utf8');
const { descriptor } = parse(source, { filename });
const script = compileScript(descriptor, { id: 'episode-tracker-test' });
// CommonJS has no import.meta: the browser-only comment count stays off, so
// the requests seen here are the catalogue's alone.
const compiled = ts.transpileModule(script.content.replaceAll('import.meta.client', 'false'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const episode = (number, firstAired = '2020-01-01T12:00:00Z') => ({ number, title: `Episode ${number}`, firstAired });
const episodes = (count = 6) => Array.from({ length: count }, (_, index) => episode(index + 1));
const catalog = (seasonNumber = 2, entries = episodes()) => ({ seasonNumber, episodes: entries });
const settle = async () => { for (let i = 0; i < 8; i += 1) await vue.nextTick(); };

// Run the actual SFC setup, events and watchers with Vue reactivity. Only the
// network, Nuxt translation and mounting boundary are substituted.
function createTracker(t, overrides = {}) {
  const props = vue.reactive({
    slug: 'example-42', seasons: [1, 2], reachedSeason: 2, reachedEpisode: 5,
    mode: 'tracking', saved: true, spoilerShieldEnabled: true, showName: 'Example',
    initialCatalog: catalog(), ...overrides,
  });
  const requests = [];
  const events = [];
  const mounted = [];
  const scope = vue.effectScope();
  const module = { exports: {} };
  runInNewContext(compiled, {
    module, exports: module.exports,
    useI18n: () => ({ t: message => message }),
    // Comment counts are a browser-only extra: none here.
    useEpisodeCommentCounts: () => ({ countOf: () => undefined, setCount: () => {}, loadCount: async () => {} }),
    $fetch: url => new Promise((resolve, reject) => { requests.push({ url, resolve, reject }); }),
    require: specifier => {
      if (specifier === 'vue') return { ...vue, onMounted: callback => mounted.push(callback) };
      if (specifier === '~/lib/watching-progress') return watchingProgress;
      if (specifier === 'lucide-vue-next' || specifier.startsWith('~/components/')) return {};
      throw new Error(`Unexpected episode-tracker dependency: ${specifier}`);
    },
  }, { filename, timeout: 1000 });
  const tracker = scope.run(() => module.exports.default.setup(props, {
    expose: () => {},
    emit(event, payload) {
      events.push({ event, payload: payload ? structuredClone(payload) : undefined });
      if (event === 'mark') {
        props.reachedSeason = payload.season;
        props.reachedEpisode = payload.episode;
        props.mode = 'tracking';
      }
      if (event === 'reset') {
        props.reachedSeason = 0;
        props.reachedEpisode = 0;
        props.mode = 'library';
      }
    },
  }));
  t.after(() => scope.stop());
  return { tracker, props, requests, events, mount: () => Promise.all(mounted.map(callback => callback())) };
}

test('displaying the last episode does not mean it has been watched', t => {
  const { tracker } = createTracker(t);
  assert.equal(tracker.viewSeason.value, 2);
  assert.equal(tracker.viewEpisode.value, 6);
  assert.equal(tracker.isSeen.value, false);
  assert.equal(tracker.isCaughtUp.value, false);
});

test('marking the last episode sets caught-up immediately, while undo and reset clear it', async t => {
  const { tracker, events } = createTracker(t);
  tracker.mark();
  assert.equal(tracker.isCaughtUp.value, true);
  await settle();
  assert.deepEqual(events[0], { event: 'mark', payload: { season: 2, episode: 6 } });
  tracker.unmark();
  assert.equal(tracker.isCaughtUp.value, false);
  await settle();
  tracker.mark();
  assert.equal(tracker.isCaughtUp.value, true);
  await settle();
  tracker.resetProgress();
  assert.equal(tracker.isCaughtUp.value, false);
});

test('saved progress at the last released episode is caught up on first render and when browsing older episodes', async t => {
  const { tracker } = createTracker(t, { reachedEpisode: 6 });
  assert.equal(tracker.isCaughtUp.value, true);
  await tracker.goPrevious();
  assert.equal(tracker.viewEpisode.value, 5);
  assert.equal(tracker.isCaughtUp.value, true);
});

test('finishing an earlier season or stopping tracking does not count as caught up', t => {
  const { tracker, props } = createTracker(t, { reachedSeason: 1, reachedEpisode: 6, initialCatalog: catalog(1) });
  assert.equal(tracker.isCaughtUp.value, false);
  for (const mode of ['undecided', 'library']) {
    const { tracker: stopped } = createTracker(t, { reachedEpisode: 6, mode });
    assert.equal(stopped.isCaughtUp.value, false);
  }
  props.seasons = [];
  assert.equal(tracker.isCaughtUp.value, false);
});

test('loading the last-season catalogue confirms caught-up only after a successful nonempty response', async t => {
  const { tracker, requests, mount } = createTracker(t, { reachedEpisode: 6, initialCatalog: null });
  assert.equal(tracker.isCaughtUp.value, false);
  const loading = mount();
  assert.equal(requests.length, 1);
  assert.equal(tracker.isCaughtUp.value, false);
  requests[0].resolve({ episodes: episodes() });
  await loading;
  assert.equal(tracker.isCaughtUp.value, true);
});

for (const response of ['empty', 'error']) {
  test(`an ${response} catalogue does not claim the viewer is caught up`, async t => {
    const { tracker, requests, mount } = createTracker(t, { reachedEpisode: 6, initialCatalog: null });
    const loading = mount();
    if (response === 'error') requests[0].reject(new Error('Episodes unavailable'));
    else requests[0].resolve({ episodes: [] });
    await loading;
    assert.equal(tracker.isCaughtUp.value, false);
  });
}

test('future episodes do not prevent being caught up with all released episodes', t => {
  const { tracker } = createTracker(t, {
    reachedEpisode: 6,
    initialCatalog: catalog(2, [...episodes(), episode(7, '2999-01-01T12:00:00Z')]),
  });
  assert.equal(tracker.isCaughtUp.value, true);
  assert.deepEqual(Array.from(tracker.viewEpisodes.value, entry => entry.number), [1, 2, 3, 4, 5, 6]);
});

for (const firstAired of [null, 'invalid-date']) {
  test(`an episode with unknown release date ${firstAired} prevents a premature caught-up claim`, t => {
    const { tracker } = createTracker(t, {
      reachedEpisode: 7,
      initialCatalog: catalog(2, [...episodes(), episode(7, firstAired)]),
    });
    assert.equal(tracker.isCaughtUp.value, false);
  });
}

test('a newly released episode or season clears the caught-up state', async t => {
  const { tracker, props } = createTracker(t, { reachedEpisode: 6 });
  assert.equal(tracker.isCaughtUp.value, true);
  props.initialCatalog = catalog(2, episodes(7));
  await settle();
  assert.equal(tracker.isCaughtUp.value, false);
  props.reachedEpisode = 7;
  await settle();
  assert.equal(tracker.isCaughtUp.value, true);
  props.seasons = [1, 2, 3];
  assert.equal(tracker.isCaughtUp.value, false);
});

test('the last episode number, not the number of catalogue rows, determines caught-up', t => {
  const { tracker, props } = createTracker(t, { reachedEpisode: 2, initialCatalog: catalog(2, [episode(1), episode(3)]) });
  assert.equal(tracker.isCaughtUp.value, false);
  props.reachedEpisode = 3;
  assert.equal(tracker.isCaughtUp.value, true);
});
