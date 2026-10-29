import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as progress from '../../lib/recap-generation-progress.ts';

const compiled = ts.transpileModule(readFileSync(new URL('../../server/services/recap-generation-runner.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Exercise the real runner, replacing only its provider and database transport.
// SQL transaction/rollback behavior is covered by recap-key-database.test.mjs.
function runner({ rpcError, committedResponseLost = false, expireBeforePublication = false } = {}) {
  const job = {
    id: 'job-1', status: 'generating', key_state: 'reserved', generation_phase: 'verifying_story',
    provider_response_id: 'response-1', progress: 90, locale: 'fr', season_id: 'season-1',
    source_snapshot: { show: { name: 'Example' }, season: { number: 1 }, episodes: [] },
    event_graph: { events: [{}, {}, {}] }, story_data: { cover: {}, beats: [] },
    updated_at: new Date().toISOString(), recap_id: null,
  };
  const calls = [];
  const updates = [];
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
      if (name.endsWith('/openai')) return { retrieveRecapGeneration: async () => ({ status: 'completed', output_text: '{}' }) };
      if (name.endsWith('/story')) return { finalizeRecapStory: () => ({ story: { final: true }, quality: { publishable: true }, slides: [{ order: 1, canvas: {} }] }) };
      if (name.endsWith('/recap-generation-progress')) return progress;
      return {};
    },
  });
  return { job, calls, updates, advance: () => module.exports.advanceRecapGenerationJob(service, job.id) };
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
