import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import * as vue from 'vue';
import { proxiedImageUrl } from '../../lib/image-url.ts';

const compiled = new Map();
function compile(filename) {
  if (!compiled.has(filename)) {
    const { descriptor } = parse(readFileSync(new URL(`../../${filename}`, import.meta.url), 'utf8'), { filename });
    const script = compileScript(descriptor, { id: `home-library-${filename}`, inlineTemplate: true });
    compiled.set(filename, ts.transpileModule(script.content, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  return compiled.get(filename);
}

// A minimal Vue host keeps the actual component templates, keyed updates,
// event handlers and lifecycle hooks running without a browser dependency.
const node = (tag, text = '') => ({ tag, text, props: {}, children: [], parent: null });
const renderer = vue.createRenderer({
  createElement: tag => node(tag),
  createText: text => node('#text', text),
  createComment: text => node('#comment', text),
  setText: (element, text) => { element.text = text; },
  setElementText: (element, text) => { element.text = text; element.children = []; },
  patchProp: (element, key, _previous, next) => { element.props[key] = next; },
  parentNode: element => element.parent,
  nextSibling: element => element.parent?.children[element.parent.children.indexOf(element) + 1] ?? null,
  insert(element, parent, anchor = null) {
    if (element.parent) element.parent.children.splice(element.parent.children.indexOf(element), 1);
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index === -1) parent.children.push(element);
    else parent.children.splice(index, 0, element);
    element.parent = parent;
  },
  remove(element) {
    if (element.parent) element.parent.children.splice(element.parent.children.indexOf(element), 1);
    element.parent = null;
  },
});
const all = element => [element, ...element.children.flatMap(all)];
const text = element => element.tag === '#comment' ? '' : element.text + element.children.map(text).join('');
const settle = async () => { for (let i = 0; i < 4; i += 1) await vue.nextTick(); };
const libraryEntry = (name, overrides = {}) => ({
  slug: `${name.toLowerCase()}-42`, name, image: null, season: 2, episode: 3,
  spoilerShieldEnabled: true, updatedAt: '2026-10-28T12:00:00Z', ...overrides,
});
const NuxtLink = vue.defineComponent({
  props: ['to'],
  setup: (props, { slots }) => () => vue.h('a', { href: props.to }, slots.default?.()),
});

function createHome(t, { userId = 'viewer-a', query = '', entries = [libraryEntry('Example')], status = 'success', error = null } = {}) {
  const user = vue.ref(userId ? { sub: userId } : null);
  const route = vue.reactive({ path: '/', query: query ? { q: query } : {}, hash: '' });
  const requests = [];
  const states = [];
  const modules = new Map();
  let nextEntries = entries;
  const useFetch = (url, options = {}) => {
    requests.push({ url, options, userId: user.value?.sub });
    if (url === '/api/shows/trending') return {
      data: vue.ref([{ name: 'Trending series', slug: 'trending', traktId: 9, image: '' }]),
      status: vue.ref('success'), refresh: () => {},
    };
    assert.equal(url, '/api/home/library');
    const state = {
      data: vue.ref(status === 'success' ? { entries: nextEntries } : undefined),
      status: vue.ref(status), error: vue.ref(error), refreshCount: 0, clearCount: 0,
      async refresh() {
        state.refreshCount += 1;
        state.error.value = null;
        state.status.value = 'success';
        state.data.value = { entries: nextEntries };
      },
      clear() {
        state.clearCount += 1;
        state.data.value = undefined;
        state.error.value = null;
        state.status.value = 'idle';
      },
    };
    states.push(state);
    return state;
  };
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename);
    const module = { exports: {} };
    runInNewContext(compile(filename), {
      module, exports: module.exports,
      ref: vue.ref, computed: vue.computed, reactive: vue.reactive, watch: vue.watch,
      nextTick: vue.nextTick, onBeforeUnmount: vue.onBeforeUnmount,
      useI18n: () => ({ t: (message, params = {}) => message.replace(/\{(\w+)\}/g, (_match, key) => params[key]) }),
      useSupabaseUser: () => user,
      useRoute: () => route,
      useRouter: () => ({ replace: async target => { route.query = target.query; } }),
      useFetch,
      useShowSearch: queryRef => ({
        results: vue.ref([]), isSearching: vue.ref(false), error: vue.ref(null), searchNow: async () => {},
        normalizedQuery: vue.computed(() => queryRef.value.trim()),
        hasQuery: vue.computed(() => queryRef.value.trim().length >= 2),
      }),
      require: specifier => {
        if (specifier === 'vue') return vue;
        if (specifier === '@vueuse/core') return { useEventListener: () => {} };
        if (specifier === '~/lib/image-url') return { proxiedImageUrl };
        if (specifier === '~/components/HomeRecentLibrary.vue') return load('components/HomeRecentLibrary.vue');
        if (specifier === '~/components/ui/SearchInput.vue') return { default: () => vue.h('input') };
        if (specifier === '~/components/ShowSearchCard.vue') return { default: props => vue.h('a', { href: `/shows/${props.show.slug}-${props.show.traktId}` }, props.show.name) };
        if (specifier === 'lucide-vue-next') return new Proxy({}, { get: () => () => vue.h('svg') });
        throw new Error(`Unexpected homepage dependency: ${specifier}`);
      },
    }, { filename, timeout: 1000 });
    modules.set(filename, module.exports);
    return module.exports;
  }
  const root = node('root');
  const app = renderer.createApp(load('pages/index.vue').default);
  app.component('NuxtLink', NuxtLink);
  app.component('AppHeader', () => vue.h('header'));
  app.mount(root);
  t.after(() => app.unmount());
  return {
    root, user, route, requests, states,
    setEntries: entries => { nextEntries = entries; },
    find: predicate => all(root).find(predicate),
    text: () => text(root),
  };
}

test('guests see trending series without requesting or rendering a private library', t => {
  const home = createHome(t, { userId: null });
  assert.match(home.text(), /Trending now.*Trending series/s);
  assert.doesNotMatch(home.text(), /My shows|View library|Example/);
  assert.deepEqual(home.requests.map(request => request.url), ['/api/shows/trending']);
});

test('signed-in visitors see recent additions before trends with correct library and series links', t => {
  const home = createHome(t, { entries: [
    libraryEntry('Tracked'),
    libraryEntry('Starting', { season: 4, episode: 0 }),
    libraryEntry('Saved', { season: null, episode: 0 }),
  ] });
  assert.ok(home.text().indexOf('My shows') < home.text().indexOf('Trending now'));
  assert.match(home.text(), /TrackedS02E03/);
  assert.equal(text(home.find(element => element.tag === 'a' && element.props.href === '/shows/starting-42')), 'Starting');
  assert.equal(text(home.find(element => element.tag === 'a' && element.props.href === '/shows/saved-42')), 'Saved');
  assert.ok(home.find(element => element.tag === 'a' && element.props.href === '/library'));
  assert.ok(home.find(element => element.tag === 'a' && element.props.href === '/shows/tracked-42'));
});

test('search results replace the discovery sections and returning home reloads additions', async t => {
  const home = createHome(t);
  const original = home.states[0];
  home.route.query = { q: 'Lost' };
  await settle();
  assert.doesNotMatch(home.text(), /My shows|Trending now/);
  assert.match(home.text(), /Results for “Lost”/);
  assert.equal(original.clearCount, 1);
  home.setEntries([libraryEntry('New addition')]);
  home.route.query = {};
  await settle();
  assert.match(home.text(), /New addition/);
  assert.equal(home.requests.filter(request => request.url === '/api/home/library').length, 2);
});

for (const status of ['idle', 'pending']) {
  test(`${status} library renders an accessible loading state while trends remain available`, t => {
    const home = createHome(t, { status });
    const section = home.find(element => element.tag === 'section' && element.props['aria-labelledby'] === 'recent-library-heading');
    assert.equal(section.props['aria-busy'], true);
    assert.ok(home.find(element => element.props.role === 'status' && element.props['aria-label'] === 'Loading your library'));
    assert.match(home.text(), /Trending series/);
    assert.doesNotMatch(home.text(), /Start your library/);
  });
}

test('an empty library explains how to add series without hiding trends', t => {
  const home = createHome(t, { entries: [] });
  assert.match(home.text(), /Start your library/);
  assert.match(home.text(), /Open a series and add it to your library/);
  assert.match(home.text(), /Trending series/);
});

test('library failures keep trends visible and the retry button loads the entries', async t => {
  const home = createHome(t, { status: 'error', error: new Error('Unavailable') });
  assert.match(home.text(), /Could not load your library/);
  assert.match(home.text(), /Trending series/);
  const retry = home.find(element => element.tag === 'button' && text(element) === 'Try again');
  assert.ok(retry);
  await retry.props.onClick();
  await settle();
  assert.equal(home.states[0].refreshCount, 1);
  assert.match(home.text(), /ExampleS02E03/);
  assert.doesNotMatch(home.text(), /Could not load your library/);
});

test('broken artwork falls back without removing the series link', async t => {
  const home = createHome(t, { entries: [libraryEntry('Example', { image: 'https://images.example.com/example.jpg' })] });
  const image = home.find(element => element.tag === 'img');
  assert.equal(image.props.src, '/api/image-proxy/?url=https%3A%2F%2Fimages.example.com%2Fexample.jpg');
  image.props.onError();
  await settle();
  assert.equal(home.find(element => element.tag === 'img'), undefined);
  assert.ok(home.find(element => element.tag === 'a' && element.props.href === '/shows/example-42'));
});

test('account changes isolate fetch keys, clear old data and prevent late responses from reappearing', async t => {
  const home = createHome(t, { status: 'pending' });
  const first = home.states[0];
  home.user.value = { sub: 'viewer-b' };
  await settle();
  const second = home.states[1];
  const requests = home.requests.filter(request => request.url === '/api/home/library');
  assert.notEqual(requests[0].options.key, requests[1].options.key);
  assert.equal(first.clearCount, 1);
  first.data.value = { entries: [libraryEntry('Private first account')] };
  first.status.value = 'success';
  second.data.value = { entries: [libraryEntry('Second account')] };
  second.status.value = 'success';
  await settle();
  assert.match(home.text(), /Second account/);
  assert.doesNotMatch(home.text(), /Private first account/);
  home.user.value = null;
  await settle();
  assert.equal(second.clearCount, 1);
  assert.equal(second.data.value, undefined);
  assert.doesNotMatch(home.text(), /Second account|My shows/);
  assert.match(home.text(), /Trending now/);
});

test('server data is reused only for hydration, not a later homepage visit', t => {
  const home = createHome(t);
  const { options } = home.requests.find(request => request.url === '/api/home/library');
  const serverResult = { entries: [libraryEntry('SSR addition')] };
  const nuxtApp = { isHydrating: true, payload: { data: { [options.key]: serverResult } } };
  assert.equal(options.getCachedData(options.key, nuxtApp), serverResult);
  nuxtApp.isHydrating = false;
  assert.equal(options.getCachedData(options.key, nuxtApp), undefined);
});
