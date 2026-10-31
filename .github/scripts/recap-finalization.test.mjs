import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as progress from '../../lib/recap-generation-progress.ts';
import * as eligibility from '../../lib/recap-eligibility.ts';

const compiled = ts.transpileModule(readFileSync(new URL('../../server/services/recap-generation-runner.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Exercise the real runner, replacing only its provider and database transport.
// SQL transaction/rollback behavior is covered by recap-key-database.test.mjs.
function runner({
  rpcError, committedResponseLost = false, expireBeforePublication = false,
  legacy = false, availabilityCode = 'eligible', sourceReady = true, rightsReady = true,
  sourceIssues = sourceReady ? [] : ['insufficient_episode_sources'],
  confirmedNumbers = [1], snapshotNumbers = [1], sourceSnapshot,
  phase = 'verifying_story', responseStatus = 'completed', loseAdmission = false,
} = {}) {
  const job = {
    id: 'job-1', status: 'generating', key_state: 'reserved', generation_phase: phase,
    provider_response_id: 'response-1', progress: 90, locale: 'fr', season_id: 'season-1',
    source_snapshot: sourceSnapshot === undefined ? {
      show: { name: 'Example', traktId: 42 }, season: { number: 1 },
      episodes: snapshotNumbers.map(number => ({ number })), providers: [],
      ...(legacy ? {} : { admission: { version: 1, checkedAt: new Date().toISOString() } }),
    } : sourceSnapshot,
    event_graph: { events: [{}, {}, {}] }, story_data: { cover: {}, beats: [] },
    updated_at: new Date().toISOString(), recap_id: null,
  };
  const calls = [];
  const updates = [];
  const providerCalls = [];
  const availabilityCalls = [];
  const service = {
    from(table) {
      assert.equal(table, 'recap_generation_job');
      let patch;
      const filters = [];
      const query = {
        select() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        update(value) { patch = value; return query; },
        single() { return execute(); },
        maybeSingle() { return execute(); },
        then(resolve, reject) { return execute().then(resolve, reject); },
      };
      async function execute() {
        if (patch?.source_snapshot && loseAdmission) {
          job.source_snapshot = { ...job.source_snapshot, admission: patch.source_snapshot.admission };
          job.updated_at = '2099-01-01T00:00:00.000Z';
        }
        if (patch?.status === 'rendering' && expireBeforePublication) {
          job.status = 'failed';
          job.key_state = 'refunded';
        }
        if (!filters.every(filter => filter(job))) return { data: null, error: null };
        if (patch) {
          updates.push(patch.status);
          Object.assign(job, patch);
          if (patch.status === 'failed' && job.key_state === 'reserved') job.key_state = 'refunded';
        }
        return { data: structuredClone(job), error: null };
      }
      return query;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      assert.equal(name, 'finalize_recap_generation');
      if (rpcError) return { data: null, error: rpcError };
      if (!progress.RECAP_GENERATION_TERMINAL_STATUSES.includes(job.status)) {
        Object.assign(job, { status: 'completed', key_state: 'spent', recap_id: 'recap-1' });
      }
      if (committedResponseLost) return { data: null, error: new Error('Response lost after commit') };
      return { data: [structuredClone(job)], error: null };
    },
  };
  const module = { exports: {} };
  runInNewContext(compiled, {
    module, exports: module.exports, console: { ...console, error() {} },
    require(name) {
      if (name.endsWith('/openai')) return {
        retrieveRecapGeneration: async () => {
          providerCalls.push('retrieve');
          return { status: responseStatus, output_text: '{}' };
        },
        ...Object.fromEntries(['startRecapGeneration', 'startSceneCritic', 'startSceneLinking', 'startSceneRecovery', 'startStoryVerification']
          .map(method => [method, async () => { providerCalls.push(method); return { id: 'paid-response' }; }])),
      };
      if (name.endsWith('/story')) return { finalizeRecapStory: () => ({ story: { final: true }, quality: { publishable: true }, slides: [{ order: 1, canvas: {} }] }) };
      if (name.endsWith('/recap-generation-progress')) return progress;
      if (name === '~/lib/recap-eligibility') return eligibility;
      if (name === '~/server/services/recap-eligibility') return {
        fetchSeasonRecapAvailability: async (...args) => {
          availabilityCalls.push(args);
          return { eligibility: eligibility.recapEligibility(availabilityCode), traktData: { episodes: confirmedNumbers.map(number => ({ number })) } };
        },
      };
      if (name.endsWith('/sources')) return { evaluateRecapSourceReadiness: () => ({ ready: sourceReady, issues: sourceIssues }) };
      if (name.endsWith('/recap-source-registry')) return { evaluateRecapSourceRights: () => ({ ready: rightsReady }) };
      return {};
    },
  });
  return { job, calls, updates, providerCalls, availabilityCalls, advance: () => module.exports.advanceRecapGenerationJob(service, job.id) };
}

test('publication, attribution and key settlement use a single atomic RPC', async () => {
  const app = runner();
  const result = await app.advance();
  assert.equal(result.status, 'completed');
  assert.equal(result.keyState, 'spent');
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].args.p_job_id, app.job.id);
  assert.deepEqual(app.updates, ['validating', 'rendering']);
  assert.equal(app.calls[0].args.p_slides.length, 1);
});

test('an attribution/publication failure fails the job instead of consuming its key', async () => {
  const app = runner({ rpcError: new Error('Attribution failed; transaction rolled back') });
  const result = await app.advance();
  assert.equal(result.status, 'failed');
  assert.equal(result.keyState, 'refunded');
  assert.equal(result.recapId, null);
});

test('a lost RPC response after commit cannot overwrite completed or refund its key', async () => {
  const app = runner({ committedResponseLost: true });
  const result = await app.advance();
  assert.equal(result.status, 'completed');
  assert.equal(result.keyState, 'spent');
  assert.equal(result.recapId, 'recap-1');
  assert.ok(!app.updates.includes('failed'));
});

test('expiry before publication cannot be undone by a late rendering transition', async () => {
  const app = runner({ expireBeforePublication: true });
  const result = await app.advance();
  assert.equal(result.status, 'failed');
  assert.equal(result.keyState, 'refunded');
  assert.equal(result.recapId, null);
  assert.deepEqual(app.updates, ['validating']);
});

for (const phase of ['preparing_story', 'extracting_events', 'recovering_events', 'critiquing_events', 'linking_events', 'writing_story', 'verifying_story']) {
  test(`a legacy ineligible job cannot reach any provider call from ${phase}`, async () => {
    const app = runner({ legacy: true, phase, availabilityCode: 'season_in_progress' });
    const result = await app.advance();
    assert.equal(result.status, 'failed');
    assert.equal(result.keyState, 'refunded');
    assert.equal(result.errorMessage, eligibility.recapEligibility('season_in_progress').message);
    assert.deepEqual(app.providerCalls, []);
    assert.equal(app.calls.length, 0);
  });
}

for (const [label, options] of [
  ['provider availability unknown', { availabilityCode: 'availability_unavailable' }],
  ['missing episodes', { confirmedNumbers: [1, 2] }],
  ['duplicate episodes', { confirmedNumbers: [1, 2], snapshotNumbers: [1, 1] }],
  ['insufficient stored sources', { sourceReady: false }],
  ['source rights unavailable', { rightsReady: false }],
  ['missing snapshot', { sourceSnapshot: null }],
  ['incomplete snapshot', { sourceSnapshot: { show: { name: 'Example' }, season: { number: 1 }, episodes: [] } }],
]) {
  test(`legacy admission refuses ${label} before any provider call`, async () => {
    const app = runner({ legacy: true, ...options });
    const result = await app.advance();
    assert.equal(result.status, 'failed');
    assert.equal(result.keyState, 'refunded');
    assert.deepEqual(app.providerCalls, []);
    assert.equal(app.calls.length, 0);
  });
}

test('a legacy job with an undocumented finale reports its precise refusal and refunds before AI', async () => {
  const app = runner({ legacy: true, sourceReady: false, sourceIssues: ['insufficient_finale_source'] });
  const result = await app.advance();
  assert.equal(result.status, 'failed');
  assert.equal(result.keyState, 'refunded');
  assert.equal(result.errorMessage, eligibility.RECAP_ELIGIBILITY_MESSAGES.finale_source_missing);
  assert.deepEqual(app.providerCalls, []);
});

test('a compatible legacy job is admitted once and continues without repeated catalogue requests', async () => {
  const app = runner({ legacy: true, responseStatus: 'in_progress' });
  await app.advance();
  assert.equal(app.job.source_snapshot.admission.version, 1);
  assert.ok(Number.isFinite(Date.parse(app.job.source_snapshot.admission.checkedAt)));
  await app.advance();
  assert.deepEqual(app.availabilityCalls, [[42, 1]]);
  assert.deepEqual(app.providerCalls, ['retrieve', 'retrieve']);
});

test('a poll that loses admission ownership cannot advance the provider', async () => {
  const app = runner({ legacy: true, loseAdmission: true });
  await app.advance();
  assert.equal(app.availabilityCalls.length, 1);
  assert.deepEqual(app.providerCalls, []);
});

test('newly admitted jobs and terminal published jobs skip legacy admission', async () => {
  const app = runner({ availabilityCode: 'availability_unavailable' });
  assert.equal((await app.advance()).status, 'completed');
  delete app.job.source_snapshot.admission;
  assert.equal((await app.advance()).status, 'completed');
  assert.deepEqual(app.availabilityCalls, []);
});
