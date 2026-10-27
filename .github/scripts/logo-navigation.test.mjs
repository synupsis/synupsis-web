import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import * as vue from 'vue';
import { NavigationFailureType } from 'vue-router';
import * as logoMotion from '../../lib/logo-motion.ts';

const filename = 'components/Logo.vue';
const source = readFileSync(new URL(`../../${filename}`, import.meta.url), 'utf8');
const { descriptor } = parse(source, { filename });
const script = compileScript(descriptor, { id: 'logo-navigation-test' });
const compiledLogo = ts.transpileModule(script.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const logoSvg = readFileSync(new URL('../../assets/svg/logo_white.svg', import.meta.url), 'utf8');

async function settle() {
  for (let index = 0; index < 5; index += 1) await vue.nextTick();
}

function navigationFailure(type) {
  return Object.assign(new Error('Navigation did not complete'), { navigationFailure: true, type });
}

function activationEvent(overrides = {}) {
  const target = overrides.target ?? '';
  return {
    button: 0,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    currentTarget: {
      target,
      getAttribute: name => name === 'target' ? target : null,
      hasAttribute: name => name === 'download' && Boolean(overrides.download),
    },
    ...overrides,
  };
}

test('a touch activation navigates immediately and replays in the new header after the old logo unmounts', async t => {
  const environment = createEnvironment(t);
  const source = environment.createLogo();
  source.mountMark();
  source.setup.onPointerEnter({ pointerType: 'touch' });
  const activation = source.setup.onActivate(activationEvent(), environment.navigate);
  assert.equal(environment.navigations.length, 1, 'navigation must start before waiting for animation');
  assert.equal(source.animations.length, 0, 'touch does not need a hover animation');

  source.unmount();
  const header = environment.createLogo({ playOnHomeArrival: true });
  header.mountMark();
  environment.navigations[0].resolve();
  await activation;
  await settle();

  assert.ok(header.animations.length > 0);
  assert.equal(source.animations.length, 0);
  assert.equal(environment.signal.pending, null);
  assert.equal(header.setup.arrowsPlaying.value, true);
});

test('only the homepage header consumes the replay, and it waits for the ClientOnly SVG', async t => {
  const environment = createEnvironment(t);
  const source = environment.createLogo();
  const activation = source.setup.onActivate(activationEvent(), environment.navigate);
  environment.navigations[0].resolve();
  await activation;

  const footer = environment.createLogo();
  const otherPageLogo = environment.createLogo();
  footer.mountMark();
  otherPageLogo.mountMark();
  const header = environment.createLogo({ playOnHomeArrival: true });
  await settle();
  assert.notEqual(environment.signal.pending, null);
  assert.equal(footer.animations.length, 0);
  assert.equal(otherPageLogo.animations.length, 0);
  assert.equal(header.animations.length, 0);

  header.mountMark();
  await settle();
  assert.ok(header.animations.length > 0);
  assert.equal(environment.signal.pending, null);
  header.finishAnimations();
  await settle();
  const played = header.animations.length;
  header.setup.mark.value = undefined;
  await settle();
  header.mountMark();
  await settle();
  assert.equal(header.animations.length, played, 'a consumed signal is not replayed after another render');
});

test('leaving home before its SVG is ready clears the pending replay for later visits', async t => {
  const environment = createEnvironment(t);
  const source = environment.createLogo();
  const activation = source.setup.onActivate(activationEvent(), environment.navigate);
  environment.navigations[0].resolve();
  await activation;
  const header = environment.createLogo({ playOnHomeArrival: true });
  assert.notEqual(environment.signal.pending, null);
  environment.currentRoute.value = { path: '/about', fullPath: '/about' };
  header.unmount();
  assert.equal(environment.signal.pending, null);

  environment.currentRoute.value = { path: '/', fullPath: '/' };
  const nextHeader = environment.createLogo({ playOnHomeArrival: true });
  nextHeader.mountMark();
  await settle();
  assert.equal(nextHeader.animations.length, 0);
});

test('activating the logo with the keyboard while already home still plays once', async t => {
  const environment = createEnvironment(t, { path: '/' });
  const header = environment.createLogo({ playOnHomeArrival: true });
  header.mountMark();
  const activation = header.setup.onActivate(activationEvent({ detail: 0 }), environment.navigate);
  environment.navigations[0].resolve(navigationFailure(NavigationFailureType.duplicated));
  await activation;
  await settle();
  assert.ok(header.animations.length > 0);
  assert.equal(environment.signal.pending, null);
  header.finishAnimations();
  await settle();
  assert.equal(header.setup.arrowsPlaying.value, false);
  assert.equal(environment.frames.size, 0);
});

for (const failure of ['aborted', 'cancelled', 'thrown', 'redirected']) {
  test(`${failure} navigation does not leave a replay for a later visit`, async t => {
    const environment = createEnvironment(t);
    const source = environment.createLogo();
    const activation = source.setup.onActivate(activationEvent(), environment.navigate);
    if (failure === 'thrown') environment.navigations[0].reject(new Error('Navigation failed'));
    else if (failure === 'redirected') environment.navigations[0].resolve(undefined, '/login');
    else environment.navigations[0].resolve(navigationFailure(NavigationFailureType[failure]));
    await activation;
    assert.equal(environment.signal.pending, null);

    environment.currentRoute.value = { path: '/', fullPath: '/' };
    const header = environment.createLogo({ playOnHomeArrival: true });
    header.mountMark();
    await settle();
    assert.equal(header.animations.length, 0);
  });
}

test('modified clicks, secondary buttons, prevented events and new-tab links retain native behavior', async t => {
  const environment = createEnvironment(t);
  const source = environment.createLogo();
  source.mountMark();
  for (const modifiers of [
    { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true },
    { button: 1 }, { button: 2 }, { defaultPrevented: true },
    { target: '_blank' }, { target: 'another-window' }, { download: true },
  ]) {
    await source.setup.onActivate(activationEvent(modifiers), environment.navigate);
  }
  await settle();
  assert.equal(environment.navigations.length, 0);
  assert.equal(environment.signal.pending, null);
  assert.equal(source.animations.length, 0);
});

test('reduced motion still navigates without playing or queuing a future animation', async t => {
  const environment = createEnvironment(t, { reducedMotion: true });
  const source = environment.createLogo();
  source.mountMark();
  source.setup.onPointerEnter({ pointerType: 'mouse' });
  const activation = source.setup.onActivate(activationEvent(), environment.navigate);
  assert.equal(environment.navigations.length, 1);
  environment.navigations[0].resolve();
  await activation;
  const header = environment.createLogo({ playOnHomeArrival: true });
  header.mountMark();
  await settle();
  assert.equal(environment.signal.pending, null);
  assert.equal(source.animations.length, 0);
  assert.equal(header.animations.length, 0);
  environment.environment.reducedMotion = false;
  header.setup.mark.value = undefined;
  await settle();
  header.mountMark();
  await settle();
  assert.equal(header.animations.length, 0);
});

test('an older navigation finishing after a newer activation cannot replay a second time', async t => {
  const environment = createEnvironment(t);
  const source = environment.createLogo();
  const first = source.setup.onActivate(activationEvent(), environment.navigate);
  const second = source.setup.onActivate(activationEvent(), environment.navigate);
  const header = environment.createLogo({ playOnHomeArrival: true });
  header.mountMark();
  environment.navigations[1].resolve();
  await second;
  await settle();
  assert.ok(header.animations.length > 0);
  header.finishAnimations();
  await settle();
  const played = header.animations.length;
  environment.navigations[0].resolve();
  await first;
  await settle();
  assert.equal(header.animations.length, played);
  assert.equal(environment.signal.pending, null);
});

test('a newer failed activation also invalidates an older successful navigation', async t => {
  const environment = createEnvironment(t);
  const source = environment.createLogo();
  const first = source.setup.onActivate(activationEvent(), environment.navigate);
  const second = source.setup.onActivate(activationEvent(), environment.navigate);
  environment.navigations[1].resolve(navigationFailure(NavigationFailureType.aborted));
  await second;
  environment.navigations[0].resolve();
  await first;
  const header = environment.createLogo({ playOnHomeArrival: true });
  header.mountMark();
  await settle();
  assert.equal(header.animations.length, 0);
  assert.equal(environment.signal.pending, null);
});

test('unmounting between the animation request and nextTick never starts browser animations', async t => {
  const environment = createEnvironment(t);
  const logo = environment.createLogo();
  await logo.setup.playArrows();
  assert.equal(logo.setup.arrowsPlaying.value, false, 'an SVG is required to start');
  logo.mountMark();
  const pending = logo.setup.playArrows();
  logo.unmount();
  await pending;
  await logo.setup.playArrows();
  await settle();
  assert.equal(logo.animations.length, 0);
  assert.equal(environment.frames.size, 0);
});

test('unmount cancels active WAAPI animations and the melt frame without restarting work', async t => {
  const environment = createEnvironment(t);
  const logo = environment.createLogo();
  logo.mountMark();
  await logo.setup.playArrows();
  assert.ok(logo.animations.length > 0);
  assert.ok(environment.frames.size > 0);
  const played = logo.animations.length;
  logo.unmount();
  await settle();
  assert.ok(logo.animations.every(animation => animation.cancelled));
  assert.equal(environment.frames.size, 0);
  await logo.setup.playArrows();
  await settle();
  assert.equal(logo.animations.length, played);
});

// Execute the actual SFC setup and event handlers. The DOM, navigation and
// Nuxt state boundary are stubbed; Vue reactivity and the animation model are real.
function createEnvironment(t, { path = '/profile', reducedMotion = false } = {}) {
  const state = new Map();
  const instances = [];
  const navigations = [];
  const frames = new Map();
  const currentRoute = vue.ref({ path, fullPath: path });
  const router = { currentRoute };
  const route = {
    get path() { return currentRoute.value.path; },
    get fullPath() { return currentRoute.value.fullPath; },
  };
  const environment = { reducedMotion };
  let nextFrame = 0;
  let nextId = 0;
  const requestAnimationFrame = callback => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  };
  const cancelAnimationFrame = id => frames.delete(id);
  const navigate = event => new Promise((resolve, reject) => {
    event.preventDefault();
    navigations.push({
      event,
      resolve(result, destination = '/') {
        if (!result || result.type === NavigationFailureType.duplicated) {
          currentRoute.value = { path: destination, fullPath: destination };
        }
        resolve(result);
      },
      reject,
    });
  });

  function createLogo(props = {}) {
    const beforeUnmount = [];
    const mounted = [];
    const animations = [];
    const scope = vue.effectScope();
    const module = { exports: {} };
    let unmounted = false;
    const vueBoundary = {
      ...vue,
      onBeforeUnmount: callback => beforeUnmount.push(callback),
      onMounted: callback => mounted.push(callback),
      useId: () => `test-logo-${++nextId}`,
    };
    const useState = (key, factory) => {
      if (!state.has(key)) state.set(key, vue.ref(factory()));
      return state.get(key);
    };
    const routerBoundary = {
      NavigationFailureType,
      isNavigationFailure: (failure, type) => Boolean(failure?.navigationFailure && (!type || (failure.type & type))),
      useRouter: () => router,
      useRoute: () => route,
    };
    runInNewContext(compiledLogo, {
      module,
      exports: module.exports,
      Error,
      window: {
        matchMedia: () => ({ matches: environment.reducedMotion }),
        requestAnimationFrame,
        cancelAnimationFrame,
      },
      performance: { now: () => 100 },
      requestAnimationFrame,
      cancelAnimationFrame,
      useState,
      useRouter: () => router,
      useRoute: () => route,
      ...vueBoundary,
      require: specifier => {
        if (specifier === 'vue') return vueBoundary;
        if (specifier === 'vue-router') return routerBoundary;
        if (specifier === '~/lib/logo-motion') return logoMotion;
        if (specifier === '~/assets/svg/logo_white.svg?raw') return { default: logoSvg };
        if (specifier === '~/assets/svg/logo_text.svg') return { default: '/test-logo-text.svg' };
        throw new Error(`Unexpected Logo dependency: ${specifier}`);
      },
    }, { filename: 'Logo.compiled.cjs', timeout: 1000 });
    const setup = scope.run(() => module.exports.default.setup(vue.reactive({
      displayText: false,
      size: 'md',
      playOnHomeArrival: false,
      ...props,
    }), { expose: () => {} }));
    mounted.forEach(callback => callback());

    function animatedElement(dataset = {}) {
      return {
        dataset,
        animate(keyframes, options) {
          let resolve;
          let reject;
          const animation = {
            keyframes,
            options,
            cancelled: false,
            finished: new Promise((resolveFinished, rejectFinished) => {
              resolve = resolveFinished;
              reject = rejectFinished;
            }),
            finish: () => resolve(),
            cancel() {
              this.cancelled = true;
              reject(new Error('Animation cancelled'));
            },
          };
          animations.push(animation);
          return animation;
        },
      };
    }
    const chevrons = logoMotion.LOGO_CHEVRONS.flatMap((_, index) => ['leaving', 'arriving']
      .map(copy => animatedElement({ chevron: String(index), copy })));
    const covers = logoMotion.LOGO_CHANNEL_COVERS.map(() => animatedElement());
    const mark = {
      querySelectorAll: selector => selector === '[data-chevron]' ? chevrons
        : selector === '[data-channel-cover]' ? covers : [],
    };
    const instance = {
      setup,
      animations,
      mountMark() { setup.mark.value = mark; },
      finishAnimations() { animations.forEach(animation => animation.finish()); },
      unmount() {
        if (unmounted) return;
        unmounted = true;
        beforeUnmount.forEach(callback => callback());
        scope.stop();
      },
    };
    instances.push(instance);
    return instance;
  }

  t.after(async () => {
    instances.forEach(instance => instance.unmount());
    await settle();
  });
  return {
    createLogo,
    currentRoute,
    environment,
    navigate,
    navigations,
    frames,
    get signal() { return state.get('logo-home-animation')?.value; },
  };
}
