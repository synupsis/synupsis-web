import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as displayLocales from '../../lib/i18n/locale.ts';
import * as keys from '../../lib/recap-keys.ts';
import * as progress from '../../lib/recap-generation-progress.ts';
import * as eligibility from '../../lib/recap-eligibility.ts';

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
  enrichmentFailure = false, finalReady = ready, eligibilityCode = 'eligible', sourceIssues = [],
  existingRecap = null, activeJob = null,
  failureRow = { key_state: 'refunded' }, failureWriteError = null,
  body = { showId: 'show-1', seasonId: 'season-1', locale: 'fr' },
} = {}) {
  const mutations = [];
  const rpcCalls = [];
  const reads = [];
  let sourcesFetched = 0;
  let extractionsStarted = 0;
  let availabilityChecks = 0;
  let enrichmentsStarted = 0;
  const order = [];
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
          order.push('insert');
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
          : { data: existingRecap, error: null };
        if (table === 'recap_generation_job') return { data: activeJob, error: null };
        if (table === 'show') return { data: { id: 'show-1', name: 'Example', trakt_id: 42, genres: [], summary: '', image: null }, error: null };
        if (table === 'season') return { data: { id: 'season-1', show_id: 'show-1', number: 1, first_aired: '2020-01-01', image: null }, error: null };
        if (table === 'recap_wallet') return { data: { keys: 3, points: 0, key_progress: 0 }, error: null };
        if (table === 'app_settings') return { data: { value: true }, error: null };
        throw new Error(`Unexpected table ${table}`);
      }
      return query;
    },
    async rpc(name, args) { order.push('reserve'); rpcCalls.push({ name, args }); return { data: 2, error: null }; },
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
    '~/lib/recap-eligibility': eligibility,
    '~/server/services/recap-eligibility': {
      fetchSeasonRecapAvailability: async () => {
        availabilityChecks += 1;
        order.push('availability');
        return { eligibility: eligibility.recapEligibility(eligibilityCode), traktData: {} };
      },
      assertRecapEligible: result => {
        if (result.eligible) return;
        throw Object.assign(new Error(result.message), {
          statusCode: result.code === 'availability_unavailable' ? 503 : 422,
          data: { code: 'recap_ineligible', eligibility: result },
        });
      },
    },
    '~/server/utils/require-admin': { isAdminUser: async () => admin },
    '~/server/services/recap-generation/openai': {
      getRecapModel: () => 'test-model',
      startEpisodeExtraction: async () => {
        extractionsStarted += 1;
        order.push('extract');
        if (extractionFailure) throw new Error('Provider unavailable');
        return { id: 'response-1' };
      },
    },
    '~/server/services/recap-generation/prompts': { createEpisodeExtractionPrompt: () => 'test prompt' },
    '~/server/services/recap-generation/sources': {
      fetchRecapSourceSnapshot: async () => {
        sourcesFetched += 1;
        order.push('sources');
        if (sourceFailure) throw new Error('Source unavailable');
        return { episodes: [{ number: 1 }] };
      },
      evaluatePreparedRecapSourceReadiness: () => ({ ready, issues: sourceIssues }),
      enrichRecapSourceSnapshot: async prepared => {
        enrichmentsStarted += 1;
        order.push('enrich');
        if (enrichmentFailure) throw new Error('Enrichment unavailable');
        return prepared;
      },
      evaluateRecapSourceReadiness: () => ({ ready: finalReady, issues: sourceIssues }),
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
    event, mutations, rpcCalls, reads, order,
    run: () => module.exports.default(event),
    get availabilityChecks() { return availabilityChecks; },
    get enrichmentsStarted() { return enrichmentsStarted; },
    get sourcesFetched() { return sourcesFetched; },
    get extractionsStarted() { return extractionsStarted; },
  };
}

for (const options of [{}, { admin: true }, { unlockedBefore: 1 }]) {
  test(`insufficient sources never create a job, reserve a ticket or call AI: ${JSON.stringify(options)}`, async () => {
    const route = endpoint(options);
    await assert.rejects(route.run(), error => error.statusCode === 422 && error.data.eligibility.code === 'insufficient_sources');
    assert.equal(route.rpcCalls.length, 0);
    assert.equal(route.mutations.length, 0);
    assert.equal(route.enrichmentsStarted, 0);
    assert.equal(route.extractionsStarted, 0);
  });
}

for (const code of ['season_in_progress', 'not_yet_aired', 'metadata_incomplete', 'metadata_inconsistent', 'special_season', 'availability_unavailable']) {
  test(`availability refusal ${code} precedes sources, job, ticket and AI`, async () => {
    const route = endpoint({ ready: true, eligibilityCode: code });
    await assert.rejects(route.run(), error => error.data.eligibility.code === code);
    assert.equal(route.sourcesFetched, 0);
    assert.equal(route.mutations.length, 0);
    assert.equal(route.rpcCalls.length, 0);
    assert.equal(route.enrichmentsStarted, 0);
  });
}

test('enforced source rights refuse before reservation and AI', async () => {
  const route = endpoint({ sourceIssues: ['source_rights_not_cleared'] });
  await assert.rejects(route.run(), error => error.data.eligibility.code === 'source_rights_restricted');
  assert.equal(route.mutations.length, 0);
  assert.equal(route.rpcCalls.length, 0);
  assert.equal(route.enrichmentsStarted, 0);
});

test('missing finale sources refuse before reservation or paid enrichment', async () => {
  const route = endpoint({ sourceIssues: ['insufficient_finale_source'] });
  await assert.rejects(route.run(), error => error.data.eligibility.code === 'finale_source_missing');
  assert.equal(route.mutations.length, 0);
  assert.equal(route.rpcCalls.length, 0);
  assert.equal(route.enrichmentsStarted, 0);
});

test('source collection failure never reserves a ticket or creates a job', async () => {
  const route = endpoint({ sourceFailure: true });
  await assert.rejects(route.run(), error => error.statusCode === 503 && error.data.eligibility.code === 'availability_unavailable');
  assert.equal(route.rpcCalls.length, 0);
  assert.equal(route.mutations.length, 0);
  assert.equal(route.enrichmentsStarted, 0);
});

test('eligible generation performs all free checks before reservation, and paid calls afterwards', async () => {
  const route = endpoint({ ready: true });
  const result = await route.run();
  assert.equal(result.state, 'generating');
  assert.deepEqual(route.order, ['availability', 'sources', 'insert', 'reserve', 'enrich', 'extract']);
});

test('published recap remains accessible without checking new-generation eligibility', async () => {
  const route = endpoint({ existingRecap: { id: 'existing' }, eligibilityCode: 'metadata_incomplete' });
  assert.equal((await route.run()).recapId, 'existing');
  assert.equal(route.availabilityChecks, 0);
  assert.equal(route.sourcesFetched, 0);
  assert.equal(route.rpcCalls.length, 0);
});

test('an active job is reused without charging or starting a second generation', async () => {
  const route = endpoint({ activeJob: { id: 'active', status: 'generating', progress: 20 } });
  assert.equal((await route.run()).jobId, 'active');
  assert.equal(route.availabilityChecks, 0);
  assert.equal(route.sourcesFetched, 0);
  assert.equal(route.rpcCalls.length, 0);
});

test('paid subtitle enrichment losing its usable evidence confirms refund after persistence', async () => {
  const route = endpoint({ ready: true, finalReady: false });
  const response = await route.run();
  assert.equal(route.event.status, 422);
  assert.equal(response.keyRefunded, true);
  assert.equal(response.statusMessage, eligibility.RECAP_ELIGIBILITY_MESSAGES.insufficient_sources);
  assert.equal(response.data, undefined); // Never label a paid failure as an uncharged refusal.
  assert.equal(route.rpcCalls.length, 1);
  assert.equal(route.extractionsStarted, 0);
});

test('a failed finale summary reports its reason and refund without claiming an uncharged preflight refusal', async () => {
  const route = endpoint({ ready: true, finalReady: false, sourceIssues: ['insufficient_finale_source'] });
  const result = await route.run();
  assert.equal(result.statusMessage, eligibility.RECAP_ELIGIBILITY_MESSAGES.finale_source_missing);
  assert.equal(result.keyRefunded, true);
  assert.equal(result.data, undefined);
  assert.equal(route.extractionsStarted, 0);
});

for (const options of [{ enrichmentFailure: true }, { extractionFailure: true }]) {
  test(`paid processing errors include a refund confirmed by the database: ${JSON.stringify(options)}`, async () => {
    const route = endpoint({ ready: true, ...options });
    await assert.rejects(route.run(), error => error.statusCode === 502 && error.data.keyRefunded === true);
    assert.equal(route.rpcCalls.length, 1);
  });
}

for (const failureRow of [null, { key_state: 'reserved' }, { key_state: 'none' }]) {
  test(`start failure without persisted refund proof stays false: ${JSON.stringify(failureRow)}`, async () => {
    const route = endpoint({ ready: true, enrichmentFailure: true, failureRow });
    await assert.rejects(route.run(), error => {
      assert.equal(error.statusCode, 502);
      assert.equal(error.data.keyRefunded, false);
      return true;
    });
  });
}

test('a database failure recording the failed job never promises a refund', async () => {
  const route = endpoint({ ready: true, enrichmentFailure: true, failureRow: null, failureWriteError: { code: '08006', message: 'Connection lost' } });
  await assert.rejects(route.run(), error => {
    assert.equal(error.statusCode, 502);
    assert.equal(error.data.keyRefunded, false);
    return true;
  });
});

test('insufficient-source failure whose persistence fails does not claim a refund', async () => {
  const route = endpoint({ ready: true, finalReady: false, failureRow: null, failureWriteError: { code: '57014', message: 'Timed out' } });
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
