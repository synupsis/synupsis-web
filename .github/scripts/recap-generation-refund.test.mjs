import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as displayLocales from '../../lib/i18n/locale.ts';
import * as keys from '../../lib/recap-keys.ts';
import * as progress from '../../lib/recap-generation-progress.ts';

const localeModule = { exports: {} };
runInNewContext(ts.transpileModule(readFileSync(new URL('../../lib/recap-locales.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: localeModule, exports: localeModule.exports, require: () => displayLocales });
const locales = localeModule.exports;

const source = readFileSync(new URL('../../server/api/recap/generate.post.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Execute the real handler; replace only its database, provider and H3 boundaries.
function endpoint({
  admin = false, unlockedBefore = 0, ready = false, sourceFailure = false, extractionFailure = false,
  failureRow = { key_state: 'refunded' }, failureWriteError = null,
  body = { showId: 'show-1', seasonId: 'season-1', locale: 'fr' },
} = {}) {
  const mutations = [];
  const rpcCalls = [];
  const reads = [];
  let sourcesFetched = 0;
  let extractionsStarted = 0;
  const service = {
    from(table) {
      let patch;
      let insert;
      let selected;
      let selectOptions;
      const filters = [];
      const query = {
        select(columns, options) { selected = columns; selectOptions = options; return query; },
        eq(key, value) { filters.push(['eq', key, value]); return query; },
        in(key, value) { filters.push(['in', key, value]); return query; },
        not() { return query; }, order() { return query; }, limit() { return query; },
        insert(value) { insert = value; return query; },
        update(value) { patch = value; return query; },
        single: execute, maybeSingle: execute,
        then: (resolve, reject) => execute().then(resolve, reject),
      };
      async function execute() {
        if (insert) {
          mutations.push({ table, insert });
          return { data: { id: 'job-1', status: 'gathering', progress: 2 }, error: null };
        }
        if (patch) {
          mutations.push({ table, patch, selected, filters });
          if (table === 'recap_generation_job' && patch.status === 'failed') {
            return { data: failureRow, error: failureWriteError };
          }
          return { data: null, error: null };
        }
        reads.push(table);
        if (table === 'recap') return selectOptions?.count
          ? { count: unlockedBefore, error: null }
          : { data: null, error: null };
        if (table === 'recap_generation_job') return { data: null, error: null };
        if (table === 'show') return { data: { id: 'show-1', name: 'Example', trakt_id: 42, genres: [], summary: '', image: null }, error: null };
        if (table === 'season') return { data: { id: 'season-1', show_id: 'show-1', number: 1, first_aired: '2020-01-01', image: null }, error: null };
        if (table === 'recap_wallet') return { data: { keys: 3, points: 0, key_progress: 0 }, error: null };
        if (table === 'app_settings') return { data: { value: true }, error: null };
        throw new Error(`Unexpected table ${table}`);
      }
      return query;
    },
    async rpc(name, args) { rpcCalls.push({ name, args }); return { data: 2, error: null }; },
  };
  const dependencies = {
    '#supabase/server': {
      serverSupabaseUser: async () => ({ sub: 'owner', user_metadata: { username: 'Owner' } }),
      serverSupabaseServiceRole: () => service,
    },
    '~/server/utils/app-settings': { isEnabledSetting: value => value === true },
    '~/lib/prompts/defaultPrompt': { isRecapPromptCompatible: () => true },
    '~/server/services/recap-generation/config': { RECAP_FORMAT_VERSION: 10, RECAP_PROMPT_VERSION: 'test' },
    '~/lib/recap-locales': locales,
    '~/lib/recap-keys': keys,
    '~/server/utils/require-admin': { isAdminUser: async () => admin },
    '~/server/services/recap-generation/openai': {
      getRecapModel: () => 'test-model',
      startEpisodeExtraction: async () => {
        extractionsStarted += 1;
        if (extractionFailure) throw new Error('Provider unavailable');
        return { id: 'response-1' };
      },
    },
    '~/server/services/recap-generation/prompts': { createEpisodeExtractionPrompt: () => 'test prompt' },
    '~/server/services/recap-generation/sources': {
      fetchRecapSourceSnapshot: async () => {
        sourcesFetched += 1;
        if (sourceFailure) throw new Error('Source unavailable');
        return { episodes: [{ number: 1 }] };
      },
      evaluateRecapSourceReadiness: () => ({ ready }),
      describeInsufficientSources: () => 'Insufficient sources',
      getEpisodeExtractionTokenBudget: () => 100,
      getExtractableEpisodes: snapshot => snapshot.episodes,
    },
    '~/server/services/recap-generation-runner': { expireStaleRecapGenerationJobs: async () => {} },
    '~/lib/recap-generation-progress': progress,
  };
  const module = { exports: {} };
  runInNewContext(compiled, {
    module, exports: module.exports, Error,
    console: { error() {} },
    defineEventHandler: handler => handler,
    readBody: async () => body,
    createError: options => Object.assign(new Error(options.statusMessage), options),
    setResponseStatus: (event, status) => { event.status = status; },
    require: name => {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  });
  const event = {};
  return {
    event, mutations, rpcCalls, reads,
    run: () => module.exports.default(event),
    get sourcesFetched() { return sourcesFetched; },
    get extractionsStarted() { return extractionsStarted; },
  };
}

test('insufficient sources confirms a refund only after the database returns refunded', async () => {
  const route = endpoint();
  const response = await route.run();
  assert.equal(route.event.status, 422);
  assert.equal(response.state, 'insufficient_sources');
  assert.equal(response.keyRefunded, true);
  assert.equal(route.rpcCalls.length, 1);
  assert.equal(route.rpcCalls[0].name, 'reserve_recap_key');
  const failure = route.mutations.find(item => item.patch?.status === 'failed');
  assert.equal(failure.selected, 'key_state');
  assert.ok(failure.filters.some(([kind, key]) => kind === 'in' && key === 'status'));
  assert.equal(route.extractionsStarted, 0);
});

for (const [label, options] of [
  ['an admin generation', { admin: true }],
  ['a free refresh of an unlocked recap', { unlockedBefore: 1 }],
]) {
  test(`insufficient sources does not promise a refund for ${label}`, async () => {
    const route = endpoint({ ...options, failureRow: { key_state: 'none' } });
    const response = await route.run();
    assert.equal(response.keyRefunded, false);
    assert.equal(route.event.status, 422);
    assert.equal(route.rpcCalls.length, 0);
  });
}

for (const [label, options] of [
  ['source collection', { sourceFailure: true }],
  ['episode extraction', { ready: true, extractionFailure: true }],
]) {
  test(`${label} errors include a refund confirmed by the database`, async () => {
    const route = endpoint(options);
    await assert.rejects(route.run(), error => {
      assert.equal(error.statusCode, 502);
      assert.equal(error.data.keyRefunded, true);
      return true;
    });
    assert.equal(route.rpcCalls.length, 1);
    assert.equal(route.sourcesFetched, 1);
    assert.equal(route.extractionsStarted, options.extractionFailure ? 1 : 0);
  });
}

for (const failureRow of [null, { key_state: 'reserved' }, { key_state: 'none' }]) {
  test(`start failure without persisted refund proof stays false: ${JSON.stringify(failureRow)}`, async () => {
    const route = endpoint({ sourceFailure: true, failureRow });
    await assert.rejects(route.run(), error => {
      assert.equal(error.statusCode, 502);
      assert.equal(error.data.keyRefunded, false);
      return true;
    });
  });
}

test('a database failure recording the failed job never promises a refund', async () => {
  const route = endpoint({ sourceFailure: true, failureRow: null, failureWriteError: { code: '08006', message: 'Connection lost' } });
  await assert.rejects(route.run(), error => {
    assert.equal(error.statusCode, 502);
    assert.equal(error.data.keyRefunded, false);
    return true;
  });
});

test('insufficient-source failure whose persistence fails does not claim a refund', async () => {
  const route = endpoint({ failureRow: null, failureWriteError: { code: '57014', message: 'Timed out' } });
  await assert.rejects(route.run(), error => {
    assert.equal(error.statusCode, 502);
    assert.equal(error.data.keyRefunded, false);
    return true;
  });
});

test('early request validation errors carry no refund proof and never reserve a key', async () => {
  const route = endpoint({ body: { showId: 'show-1' } });
  await assert.rejects(route.run(), error => {
    assert.equal(error.statusCode, 400);
    assert.equal(error.data?.keyRefunded, undefined);
    return true;
  });
  assert.equal(route.reads.length, 0);
  assert.equal(route.rpcCalls.length, 0);
  assert.equal(route.sourcesFetched, 0);
});
