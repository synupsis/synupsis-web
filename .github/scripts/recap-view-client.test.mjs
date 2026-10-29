import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';
import { RECAP_VIEW_MIN_SLIDE_MS } from '../../lib/recap-keys.ts';

const filename = 'composables/useRecapView.ts';
const compiled = ts.transpileModule(readFileSync(new URL(`../../${filename}`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const heartbeat = RECAP_VIEW_MIN_SLIDE_MS + 100;
const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

// Execute the actual composable with real Vue reactivity and a deterministic
// clock. Only lifecycle, browser visibility and the network are substituted.
function createViewer(t, { userId = 'alice', status = 'published', displayed = true, visibility = 'visible', transport } = {}) {
  const user = vue.ref(userId ? { sub: userId } : null);
  const story = vue.ref(status ? { id: 'recap-a', status } : null);
  const index = vue.ref(0);
  const shown = vue.ref(displayed);
  const mounted = [];
  const unmounted = [];
  const listeners = new Map();
  const timers = new Map();
  const calls = [];
  let now = 0, nextTimer = 1, session = 0, inFlight = 0, maxInFlight = 0;
  const document = {
    visibilityState: visibility,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  const module = { exports: {} };
  runInNewContext(compiled, {
    module, exports: module.exports, document,
    useSupabaseUser: () => user,
    setTimeout: (fn, delay) => { const id = nextTimer++; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout: id => timers.delete(id),
    $fetch: async (url, options) => {
      const call = { url, ...structuredClone(options), userId: user.value?.sub ?? null, at: now };
      calls.push(call);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        if (transport) {
          const custom = await transport(call, calls.length);
          if (custom !== undefined) return custom;
        }
        return url.endsWith('/view-session') ? { sessionId: `session-${++session}`, complete: false } : { complete: false };
      } finally { inFlight--; }
    },
    require: name => {
      if (name === 'vue') return { ...vue, onMounted: fn => mounted.push(fn), onBeforeUnmount: fn => unmounted.push(fn) };
      if (name === '~/lib/recap-keys') return { RECAP_VIEW_MIN_SLIDE_MS };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename });
  const scope = vue.effectScope();
  scope.run(() => module.exports.useRecapView({ story: () => story.value, slideIndex: () => index.value, displayed: () => shown.value }));
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    unmounted.forEach(fn => fn());
    scope.stop();
  }
  t.after(dispose);
  return {
    user, story, index, shown, calls, timers, listeners,
    get maxInFlight() { return maxInFlight; },
    mount: async () => { mounted.forEach(fn => fn()); await flush(); },
    hide: async () => { document.visibilityState = 'hidden'; listeners.get('visibilitychange')?.(); await flush(); },
    show: async () => { document.visibilityState = 'visible'; listeners.get('visibilitychange')?.(); await flush(); },
    dispose: async () => { dispose(); await flush(); },
    async advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers.entries()].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
        await flush();
      }
      now = end;
      await flush();
    },
  };
}

test('starts a fresh session only for an authenticated, loaded, visible published story', async t => {
  const viewer = createViewer(t, { userId: null, status: null, displayed: false });
  await viewer.mount();
  viewer.story.value = { id: 'recap-a', status: 'draft' };
  viewer.user.value = { sub: 'alice' };
  viewer.shown.value = true;
  await flush();
  assert.equal(viewer.calls.length, 0);
  await viewer.hide();
  viewer.story.value.status = 'published';
  await flush();
  assert.equal(viewer.calls.length, 0);
  await viewer.show();
  assert.equal(viewer.calls.length, 1);
  assert.equal(viewer.calls[0].url, '/api/recap/recap-a/view-session');
  assert.deepEqual(viewer.calls[0].body, { slideIndex: 0 });
});

test('reports server-session progress after dwell and on each slide transition', async t => {
  const viewer = createViewer(t);
  await viewer.mount();
  await viewer.advance(heartbeat - 1);
  assert.equal(viewer.calls.length, 1);
  await viewer.advance(1);
  assert.deepEqual(viewer.calls[1].body, { sessionId: 'session-1', slideIndex: 0 });
  await viewer.advance(heartbeat * 5);
  assert.equal(viewer.calls.length, 2, 'an acknowledged slide needs no more heartbeats');
  viewer.index.value = 4;
  await flush();
  assert.deepEqual(viewer.calls[2].body, { sessionId: 'session-1', slideIndex: 4 });
  await viewer.advance(heartbeat);
  assert.deepEqual(viewer.calls[3].body, { sessionId: 'session-1', slideIndex: 4 });
  assert.ok(viewer.calls.slice(1).every(call => call.url.endsWith('/view') && call.body.sessionId));
});

test('a pending dwell acknowledgment cannot suppress tracking a newly selected slide', async t => {
  const dwell = deferred();
  const viewer = createViewer(t, { transport: (_call, number) => number === 2 ? dwell.promise : undefined });
  await viewer.mount();
  await viewer.advance(heartbeat);
  viewer.index.value = 3;
  await flush();
  assert.equal(viewer.calls.length, 2);
  dwell.resolve({ complete: false });
  await flush();
  assert.equal(viewer.calls[2].body.slideIndex, 3);
  await viewer.advance(heartbeat);
  assert.equal(viewer.calls[3].body.slideIndex, 3);
  await viewer.advance(heartbeat * 3);
  assert.equal(viewer.calls.length, 4);
});

test('rapid slide or visibility round trips during session start still require a delayed dwell acknowledgment', async t => {
  for (const roundTrip of [
    viewer => { viewer.index.value = 1; viewer.index.value = 0; },
    viewer => { viewer.shown.value = false; viewer.shown.value = true; },
  ]) {
    const start = deferred();
    const viewer = createViewer(t, { transport: (_call, number) => number === 1 ? start.promise : undefined });
    await viewer.mount();
    roundTrip(viewer);
    start.resolve({ sessionId: 'slow-session', complete: false });
    await flush();
    assert.deepEqual(viewer.calls[1].body, { sessionId: 'slow-session', slideIndex: 0 });
    assert.equal(viewer.calls[1].at, 0, 'the immediate sync cannot acknowledge one second of dwell');
    await viewer.advance(heartbeat - 1);
    assert.equal(viewer.calls.length, 2);
    await viewer.advance(1);
    assert.deepEqual(viewer.calls[2].body, { sessionId: 'slow-session', slideIndex: 0 });
    assert.equal(viewer.calls[2].at, heartbeat);
    await viewer.advance(heartbeat * 3);
    assert.equal(viewer.calls.length, 3, 'only the delayed acknowledgment stops further heartbeats');
  }
});

test('serializes pending requests and pauses if the story becomes hidden before start returns', async t => {
  const start = deferred();
  const viewer = createViewer(t, { transport: (_call, number) => number === 1 ? start.promise : undefined });
  await viewer.mount();
  viewer.index.value = 2;
  await viewer.hide();
  assert.equal(viewer.calls.length, 1);
  start.resolve({ sessionId: 'slow-session', complete: false });
  await flush();
  assert.deepEqual(viewer.calls[1].body, { sessionId: 'slow-session', slideIndex: null });
  assert.equal(viewer.calls[1].keepalive, true);
  assert.equal(viewer.maxInFlight, 1);
  await viewer.advance(heartbeat * 3);
  assert.equal(viewer.calls.length, 2);
});

test('pauses hidden reading and resumes the current slide with a new dwell interval', async t => {
  const viewer = createViewer(t);
  await viewer.mount();
  await viewer.hide();
  assert.equal(viewer.calls.at(-1).body.slideIndex, null);
  viewer.index.value = 3;
  await flush();
  await viewer.advance(heartbeat * 4);
  assert.equal(viewer.calls.length, 2);
  await viewer.show();
  assert.deepEqual(viewer.calls.at(-1).body, { sessionId: 'session-1', slideIndex: 3 });
  await viewer.advance(heartbeat);
  assert.equal(viewer.calls.at(-1).body.slideIndex, 3);
});

test('restarts after a failed pause instead of resuming a clock that included hidden time', async t => {
  const viewer = createViewer(t, { transport: call => {
    if (call.body.slideIndex === null) throw new TypeError('Network lost');
  } });
  await viewer.mount();
  await viewer.hide();
  await viewer.advance(heartbeat * 4);
  await viewer.show();
  assert.equal(viewer.calls.at(-1).url, '/api/recap/recap-a/view-session');
});

test('retries transient failures and restarts expired sessions without submitting fabricated progress', async t => {
  const viewer = createViewer(t, { transport: (_call, number) => {
    if (number === 1) throw new TypeError('Network lost');
    if (number === 3) throw { statusCode: 409 };
  } });
  await viewer.mount();
  await viewer.advance(heartbeat);
  assert.equal(viewer.calls[1].url, '/api/recap/recap-a/view-session');
  await viewer.advance(heartbeat);
  assert.equal(viewer.calls[2].url, '/api/recap/recap-a/view');
  await viewer.advance(heartbeat);
  assert.equal(viewer.calls[3].url, '/api/recap/recap-a/view-session');
});

test('ignores old-account start responses and opens an isolated session for the new user', async t => {
  const start = deferred();
  const viewer = createViewer(t, { transport: (_call, number) => number === 1 ? start.promise : undefined });
  await viewer.mount();
  viewer.user.value = { sub: 'bob' };
  start.resolve({ sessionId: 'alice-session', complete: false });
  await flush();
  assert.equal(viewer.calls[1].url, '/api/recap/recap-a/view-session');
  assert.equal(viewer.calls[1].userId, 'bob');
  await viewer.advance(heartbeat);
  assert.notEqual(viewer.calls.at(-1).body.sessionId, 'alice-session');
  viewer.user.value = null;
  await flush();
  const before = viewer.calls.length;
  await viewer.advance(heartbeat * 3);
  assert.equal(viewer.calls.length, before);
});

test('stops tracking after the server confirms a view or says no session is needed', async t => {
  const alreadyViewed = createViewer(t, { transport: () => ({ sessionId: null, complete: true }) });
  await alreadyViewed.mount();
  await alreadyViewed.advance(heartbeat * 3);
  assert.equal(alreadyViewed.calls.length, 1);
  const viewer = createViewer(t, { transport: (_call, number) => number === 2 ? { complete: true } : undefined });
  await viewer.mount();
  await viewer.advance(heartbeat);
  viewer.index.value = 7;
  await viewer.advance(heartbeat * 3);
  assert.equal(viewer.calls.length, 2);
});

test('closing or unmounting pauses the session and removes timers and listeners', async t => {
  const viewer = createViewer(t);
  await viewer.mount();
  viewer.shown.value = false;
  await flush();
  assert.equal(viewer.calls.at(-1).body.slideIndex, null);
  await viewer.dispose();
  const before = viewer.calls.length;
  await viewer.advance(heartbeat * 3);
  assert.equal(viewer.calls.length, before);
  assert.equal(viewer.timers.size, 0);
  assert.equal(viewer.listeners.size, 0);
});

test('an in-flight start completing after teardown can only pause, never schedule further tracking', async t => {
  const start = deferred();
  const viewer = createViewer(t, { transport: (_call, number) => number === 1 ? start.promise : undefined });
  await viewer.mount();
  await viewer.dispose();
  start.resolve({ sessionId: 'late-session', complete: false });
  await flush();
  assert.deepEqual(viewer.calls[1].body, { sessionId: 'late-session', slideIndex: null });
  await viewer.advance(heartbeat * 3);
  assert.equal(viewer.calls.length, 2);
  assert.equal(viewer.timers.size, 0);
});
