import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import * as vue from 'vue';

const compiledPages = new Map();

function compiledPage(name) {
  if (!compiledPages.has(name)) {
    const filename = `pages/${name}.vue`;
    const source = readFileSync(new URL(`../../${filename}`, import.meta.url), 'utf8');
    const { descriptor } = parse(source, { filename });
    const script = compileScript(descriptor, { id: `auth-test-${name}` });
    compiledPages.set(name, ts.transpileModule(script.content, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  return compiledPages.get(name);
}

// Execute each page's actual setup and handlers. Only presentation imports and
// Nuxt/network boundaries are stubbed; Vue refs and the SFC compiler are real.
function createPage(name) {
  const requests = [];
  const navigations = [];
  const module = { exports: {} };
  const request = (operation, payload) => new Promise((resolve, reject) => {
    requests.push({ operation, payload: structuredClone(payload), resolve, reject });
  });
  runInNewContext(compiledPage(name), {
    module,
    exports: module.exports,
    Error,
    ref: vue.ref,
    useHead: () => {},
    useSupabaseClient: () => ({
      auth: {
        signInWithPassword: payload => request('login', payload),
        signUp: payload => request('signup', payload),
      },
    }),
    navigateTo: async target => { navigations.push(structuredClone(target)); },
    require: specifier => {
      if (specifier === 'vue') return vue;
      if (specifier === 'lucide-vue-next' || specifier.startsWith('~/components/')) return {};
      throw new Error(`Unexpected auth-page dependency: ${specifier}`);
    },
  }, { filename: `${name}.compiled.cjs`, timeout: 1000 });
  const page = module.exports.default.setup({}, { expose: () => {} });
  page.email.value = '  viewer@example.com  ';
  page.password.value = '  exact password  ';
  if (page.username) page.username.value = '  Viewer  ';
  return { page, requests, navigations };
}

test('login trims email, preserves password exactly and navigates only after success', async () => {
  const { page, requests, navigations } = createPage('login');
  const pending = page.login();
  assert.equal(page.isLoading.value, true);
  assert.deepEqual(requests[0].payload, { email: 'viewer@example.com', password: '  exact password  ' });
  assert.deepEqual(navigations, []);
  requests[0].resolve({ error: null });
  await pending;
  assert.deepEqual(navigations, ['/']);
  assert.equal(page.isLoading.value, false);
  assert.equal(page.errorMessage.value, '');
});

test('login rejects duplicate submissions while a request is pending', async () => {
  const { page, requests } = createPage('login');
  const pending = page.login();
  await page.login();
  assert.equal(requests.length, 1);
  requests[0].resolve({ error: null });
  await pending;
});

test('login requires a nonblank email and a password before contacting Supabase', async () => {
  const { page, requests } = createPage('login');
  page.email.value = '   ';
  await page.login();
  page.email.value = 'viewer@example.com';
  page.password.value = '';
  await page.login();
  assert.equal(requests.length, 0);
  assert.equal(page.isLoading.value, false);
});

for (const failure of ['credentials', 'network']) {
  test(`login recovers from a ${failure} failure and can be retried`, async () => {
    const { page, requests, navigations } = createPage('login');
    const pending = page.login();
    if (failure === 'credentials') requests[0].resolve({ error: { message: 'Invalid login credentials' } });
    else requests[0].reject(new Error('Network unavailable'));
    await pending;
    assert.equal(page.isLoading.value, false);
    assert.ok(page.errorMessage.value);
    if (failure === 'credentials') assert.equal(page.errorMessage.value, 'Invalid login credentials');
    assert.deepEqual(navigations, []);

    const retry = page.login();
    assert.equal(page.isLoading.value, true);
    assert.equal(page.errorMessage.value, '');
    requests[1].resolve({ error: null });
    await retry;
    assert.equal(page.isLoading.value, false);
    assert.deepEqual(navigations, ['/']);
  });
}

test('signup validates username, email and eight-character minimum before contacting Supabase', async () => {
  const { page, requests } = createPage('signup');
  page.username.value = '   ';
  await page.register();
  assert.ok(page.formError.value);
  page.username.value = 'Viewer';
  page.email.value = '   ';
  await page.register();
  assert.ok(page.formError.value);
  page.email.value = 'viewer@example.com';
  page.password.value = '1234567';
  await page.register();
  assert.match(page.formError.value, /at least 8/);
  assert.equal(requests.length, 0);
  assert.equal(page.isLoading.value, false);

  page.password.value = '12345678';
  const valid = page.register();
  assert.equal(requests.length, 1);
  assert.equal(page.formError.value, '');
  requests[0].resolve({ data: { session: {}, user: {} }, error: null });
  await valid;
});

test('signup sends trimmed username metadata and email but preserves the password', async () => {
  const { page, requests, navigations } = createPage('signup');
  const pending = page.register();
  assert.equal(page.isLoading.value, true);
  assert.deepEqual(requests[0].payload, {
    email: 'viewer@example.com',
    password: '  exact password  ',
    options: { data: { username: 'Viewer' } },
  });
  requests[0].resolve({ data: { session: { user: {} }, user: { email: 'viewer@example.com' } }, error: null });
  await pending;
  assert.deepEqual(navigations, ['/']);
  assert.equal(page.isLoading.value, false);
});

test('signup sends an unconfirmed user to the inbox screen and rejects duplicate submissions', async () => {
  const { page, requests, navigations } = createPage('signup');
  const pending = page.register();
  await page.register();
  assert.equal(requests.length, 1);
  requests[0].resolve({ data: { session: null, user: { email: 'confirmed-address@example.com' } }, error: null });
  await pending;
  assert.deepEqual(navigations, [{ path: '/email-confirmation', query: { email: 'confirmed-address@example.com' } }]);
  assert.equal(page.isLoading.value, false);
});

test('signup confirmation falls back to the submitted email when the user has none', async () => {
  const { page, requests, navigations } = createPage('signup');
  const pending = page.register();
  requests[0].resolve({ data: { session: null, user: { id: 'user-1' } }, error: null });
  await pending;
  assert.deepEqual(navigations, [{ path: '/email-confirmation', query: { email: 'viewer@example.com' } }]);
});

for (const failure of ['provider', 'network', 'missing user']) {
  test(`signup recovers from ${failure} failure without navigating and supports retry`, async () => {
    const { page, requests, navigations } = createPage('signup');
    const pending = page.register();
    if (failure === 'provider') requests[0].resolve({ data: { user: null, session: null }, error: { message: 'Signup is temporarily unavailable' } });
    else if (failure === 'network') requests[0].reject(new Error('Network unavailable'));
    else requests[0].resolve({ data: { user: null, session: null }, error: null });
    await pending;
    assert.equal(page.isLoading.value, false);
    assert.ok(page.formError.value);
    if (failure === 'provider') assert.equal(page.formError.value, 'Signup is temporarily unavailable');
    assert.deepEqual(navigations, []);

    const retry = page.register();
    assert.equal(page.isLoading.value, true);
    assert.equal(page.formError.value, '');
    requests[1].resolve({ data: { session: {}, user: {} }, error: null });
    await retry;
    assert.equal(page.isLoading.value, false);
    assert.deepEqual(navigations, ['/']);
  });
}
