import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';
import * as locales from '../../lib/i18n/locale.ts';
import { accountMessages } from '../../lib/i18n/account.ts';

const root = new URL('../../', import.meta.url);
function loadComposable(name, globals) {
  const source = readFileSync(new URL(`composables/${name}.ts`, root), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(compiled, {
    module, exports: module.exports, ...globals,
    require: specifier => {
      if (specifier === 'vue') return vue;
      if (specifier === '~/lib/i18n/locale') return locales;
      if (specifier === '~/lib/i18n/messages') return { frenchMessages: accountMessages };
      throw new Error(`Unexpected dependency: ${specifier}`);
    },
  });
  return module.exports[name];
}

function createContext({ header = 'en', initialUser = null, initialSession = null } = {}) {
  const user = vue.ref(initialUser);
  const session = vue.ref(initialSession);
  const states = new Map();
  const globals = {
    useSupabaseUser: () => user,
    useSupabaseSession: () => session,
    useRequestHeaders: () => ({ 'accept-language': header }),
    useState: (key, init) => {
      if (!states.has(key)) states.set(key, vue.ref(init()));
      return states.get(key);
    },
  };
  const useI18n = loadComposable('useI18n', globals);
  return { user, session, states, globals, useI18n, i18n: useI18n() };
}
const account = (language, sub = 'alice') => ({ sub, user_metadata: { display_language: language, username: 'Alice' } });

test('browser detection handles regional variants, ranked supported languages and fallback', () => {
  assert.equal(locales.getBrowserLocale(['fr-CA', 'en-US']), 'fr');
  assert.equal(locales.getBrowserLocale(['de-DE', 'en-GB', 'fr']), 'en');
  assert.equal(locales.getBrowserLocale(['de', 'es']), 'en');
  assert.equal(locales.getBrowserLocale([]), 'en');
  assert.equal(locales.normalizeLocale(' FR_fr '), 'fr');
  assert.equal(locales.normalizeLocale({ language: 'fr' }), null);
});

test('SSR language negotiation honors quality, excludes zero and malformed quality, and preserves ties', () => {
  assert.equal(locales.getRequestLocale('en;q=0.5, fr-CH;q=0.9'), 'fr');
  assert.equal(locales.getRequestLocale('fr;q=0, en;q=0.5'), 'en');
  assert.equal(locales.getRequestLocale('fr;q=invalid, en'), 'en');
  assert.equal(locales.getRequestLocale('en;q=2, fr;q=0.8'), 'fr');
  assert.equal(locales.getRequestLocale('de, fr;q=0.8, en;q=0.8'), 'fr');
  assert.equal(locales.getRequestLocale('*'), 'en');
  assert.equal(locales.getRequestLocale(), 'en');
});

test('visitor, login, preference change and logout update translations reactively', () => {
  const { i18n, user } = createContext({ header: 'fr-FR,en;q=0.8' });
  const label = vue.computed(() => i18n.t('Display language'));
  assert.equal(label.value, 'Langue d’affichage');
  user.value = account('en');
  assert.equal(i18n.preference.value, 'en');
  assert.equal(label.value, 'Display language');
  user.value.user_metadata.display_language = 'fr';
  assert.equal(label.value, 'Langue d’affichage');
  user.value = null;
  assert.equal(i18n.preference.value, 'browser');
  assert.equal(label.value, 'Langue d’affichage');
  i18n.browserLocale.value = 'en';
  assert.equal(label.value, 'Display language');
});

test('accounts without a supported preference follow the browser; no preference leaks to another user', () => {
  const { i18n, user, session } = createContext({ header: 'en' });
  for (const value of [null, undefined, 'de', 'fr-CA', {}, 'browser']) {
    user.value = account(value);
    assert.equal(i18n.locale.value, 'en');
  }
  session.value = { user: { id: 'alice', user_metadata: { display_language: 'fr' } } };
  assert.equal(i18n.locale.value, 'fr');
  user.value = account('en', 'bob');
  assert.equal(i18n.locale.value, 'en');
  user.value = null;
  assert.equal(i18n.locale.value, 'en');
});

test('fresh client session metadata takes priority over stale JWT claims, while SSR can omit session.user', () => {
  const context = createContext({ header: 'en', initialUser: account('fr'), initialSession: { access_token: 'token' } });
  assert.equal(context.i18n.locale.value, 'fr');
  context.session.value.user = { id: 'alice', user_metadata: { display_language: 'en' } };
  assert.equal(context.i18n.locale.value, 'en');
});

test('hydrated state is shared across components and isolated between SSR requests', () => {
  const french = createContext({ header: 'fr' });
  const english = createContext({ header: 'en' });
  french.i18n.browserLocale.value = 'en';
  assert.equal(french.useI18n().locale.value, 'en');
  french.i18n.browserLocale.value = 'fr';
  assert.equal(english.i18n.locale.value, 'en');
});

test('interpolation supports zero, preserves missing placeholders and never uses inherited dictionary values', () => {
  assert.equal(locales.translate('Season {number}', 'fr', accountMessages, { number: 0 }), 'Saison 0');
  assert.equal(locales.translate('Season {number}', 'en', accountMessages, { number: 2 }), 'Season 2');
  assert.equal(locales.translate('Season {number}', 'fr', accountMessages), 'Saison {number}');
  assert.equal(locales.translate('Missing message', 'fr', accountMessages), 'Missing message');
  assert.equal(locales.translate('toString', 'fr', accountMessages), 'toString');
});

function createPreferenceContext() {
  const context = createContext({ header: 'en', initialUser: account(null) });
  const calls = [];
  let updateResponse;
  let refreshError;
  const client = { auth: {
    updateUser: payload => new Promise((resolve, reject) => { calls.push(structuredClone(payload)); updateResponse = { resolve, reject }; }),
    refreshSession: async () => {
      calls.push('refresh');
      if (refreshError) throw refreshError;
      return { error: null };
    },
  } };
  const preferences = loadComposable('useLanguagePreference', { ...context.globals, useSupabaseClient: () => client })();
  return {
    ...context, ...preferences, calls,
    resolve: language => updateResponse.resolve({ data: { user: { id: 'alice', user_metadata: { username: 'Alice', display_language: language } } }, error: null }),
    fail: () => updateResponse.resolve({ data: { user: null }, error: new Error('Save failed') }),
    disconnect: () => updateResponse.reject(new Error('Network error')),
    failRefresh: () => { refreshError = new Error('Refresh failed'); },
  };
}

for (const preference of ['fr', 'en', 'browser']) {
  test(`saving ${preference} persists only display_language and updates UI after success`, async () => {
    const context = createPreferenceContext();
    const pending = context.saveLanguagePreference(preference);
    assert.equal(context.saving.value, true);
    assert.equal(context.i18n.preference.value, 'browser');
    assert.deepEqual(context.calls, [{ data: { display_language: preference === 'browser' ? null : preference } }]);
    assert.equal(await context.saveLanguagePreference('fr'), false);
    context.resolve(preference === 'browser' ? null : preference);
    assert.equal(await pending, true);
    assert.equal(context.i18n.preference.value, preference);
    assert.equal(context.user.value.user_metadata.username, 'Alice');
    assert.equal(context.saving.value, false);
    assert.equal(context.calls.at(-1), 'refresh');
  });
}

for (const failure of ['fail', 'disconnect']) {
  test(`a ${failure} does not apply an unsaved language and allows retry`, async () => {
    const context = createPreferenceContext();
    const pending = context.saveLanguagePreference('fr');
    context[failure]();
    await assert.rejects(pending);
    assert.equal(context.i18n.preference.value, 'browser');
    assert.equal(context.saving.value, false);
    const retry = context.saveLanguagePreference('fr');
    context.resolve('fr');
    await retry;
    assert.equal(context.i18n.locale.value, 'fr');
  });
}

test('save cannot apply a previous account preference after switching accounts', async () => {
  const context = createPreferenceContext();
  const pending = context.saveLanguagePreference('fr');
  context.user.value = account('en', 'bob');
  context.resolve('fr');
  assert.equal(await pending, false);
  assert.equal(context.i18n.locale.value, 'en');
  assert.equal(context.calls.length, 1);
});

test('save rejects unsupported values and signed-out requests before reaching Supabase', async () => {
  const context = createPreferenceContext();
  await assert.rejects(context.saveLanguagePreference('de'), /Unsupported/);
  context.user.value = null;
  await assert.rejects(context.saveLanguagePreference('fr'), /Sign in/);
  assert.equal(context.calls.length, 0);
});

test('a refresh network failure does not discard a preference already saved by Supabase', async () => {
  const context = createPreferenceContext();
  context.failRefresh();
  const pending = context.saveLanguagePreference('fr');
  context.resolve('fr');
  assert.equal(await pending, true);
  assert.equal(context.i18n.locale.value, 'fr');
  assert.equal(context.saving.value, false);
});
