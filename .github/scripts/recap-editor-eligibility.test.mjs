import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createError } from 'h3';
import { recapEligibility } from '../../lib/recap-eligibility.ts';

const projectRoot = new URL('../../', import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('~/')) return { url: new URL(`${specifier.slice(2)}.ts`, projectRoot).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { assertRecapEligible } = await import('../../server/services/recap-eligibility.ts');
const compiled = ts.transpileModule(readFileSync(new URL('server/utils/recap-editor.ts', projectRoot), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function editor({ eligibilityCode = 'season_in_progress', existingStatus = null, mismatchedSeason = false, mismatchedRecap = false } = {}) {
  const writes = [];
  let availabilityCalls = 0;
  const body = { showId: 'show-1', seasonId: 'season-1', slides: [{ canvas: '{}' }], ...(existingStatus ? { recapId: 'recap-1' } : {}) };
  const existingRecap = existingStatus ? {
    id: 'recap-1', show_id: mismatchedRecap ? 'show-2' : 'show-1', season_id: 'season-1', status: existingStatus,
    story_data: null, quality_report: null,
  } : null;
  const service = {
    from(table) {
      let operation = 'read';
      let value;
      const filters = [];
      const query = {
        select() { return query; },
        eq(key, val) { filters.push([key, val]); return query; },
        in(key, val) { filters.push([key, val]); return query; },
        order() { return query; }, limit() { return query; },
        insert(val) { operation = 'insert'; value = val; return query; },
        update(val) { operation = 'update'; value = val; return query; },
        delete() { operation = 'delete'; return query; },
        single: execute, maybeSingle: execute,
        then: (resolve, reject) => execute().then(resolve, reject),
      };
      async function execute() {
        if (operation !== 'read') {
          writes.push({ table, operation, value });
          if (table === 'recap' && operation === 'insert') return { data: { id: 'recap-1', ...value }, error: null };
          if (table === 'slide' && operation === 'insert') return { data: [{ id: 'slide-1' }], error: null };
          return { data: null, error: null };
        }
        if (table === 'show') return { data: { id: 'show-1', trakt_id: 42 }, error: null };
        if (table === 'season') {
          // A real database only rejects this relation when the handler adds its filter.
          const scopedToShow = filters.some(([key, val]) => key === 'show_id' && val === 'show-1');
          return { data: mismatchedSeason && scopedToShow ? null : { id: 'season-1', number: 1 }, error: null };
        }
        if (table === 'recap') return { data: existingRecap, error: null };
        if (table === 'slide') return { data: [], error: null };
        throw new Error(`Unexpected table ${table}`);
      }
      return query;
    },
  };
  const dependencies = {
    h3: { createError, readBody: async () => body },
    '#supabase/server': { serverSupabaseServiceRole: () => service },
    '~/server/utils/require-admin': { requireAdminUser: async () => ({ sub: 'admin-1' }) },
    '~/server/services/recap-eligibility': {
      assertRecapEligible,
      fetchSeasonRecapAvailability: async () => { availabilityCalls += 1; return { eligibility: recapEligibility(eligibilityCode) }; },
    },
  };
  const module = { exports: {} };
  runInNewContext(compiled, {
    module, exports: module.exports, console,
    require(name) { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
  });
  return { writes, run: publish => module.exports.saveRecapFromEditor({}, publish), get availabilityCalls() { return availabilityCalls; } };
}

for (const existingStatus of [null, 'draft']) {
  test(`manual ${existingStatus ? 'draft' : 'new recap'} cannot publish while the season is airing`, async () => {
    const route = editor({ existingStatus });
    await assert.rejects(route.run(true), error => error.statusCode === 422 && error.data.eligibility.code === 'season_in_progress');
    assert.equal(route.availabilityCalls, 1);
    assert.equal(route.writes.length, 0);
  });
}

test('a new manual draft may be prepared while release metadata is unavailable', async () => {
  const route = editor({ eligibilityCode: 'availability_unavailable' });
  const result = await route.run(false);
  assert.equal(result.status, 'draft');
  assert.equal(route.availabilityCalls, 0);
  assert.equal(route.writes.find(write => write.table === 'recap' && write.operation === 'insert').value.status, 'draft');
});

test('editing a published recap preserves it when release metadata becomes unavailable', async () => {
  const route = editor({ eligibilityCode: 'availability_unavailable', existingStatus: 'published' });
  const result = await route.run(true);
  assert.equal(result.status, 'published');
  assert.equal(route.availabilityCalls, 0);
  assert.equal(route.writes.find(write => write.table === 'recap' && write.operation === 'update').value.status, 'published');
});

test('manual publication succeeds for an eligible completed season', async () => {
  const route = editor({ eligibilityCode: 'eligible' });
  const result = await route.run(true);
  assert.equal(result.status, 'published');
  assert.equal(route.availabilityCalls, 1);
  assert.ok(route.writes.some(write => write.table === 'slide' && write.operation === 'insert'));
});

for (const publish of [false, true]) {
  test(`show-season mismatch prevents writes when ${publish ? 'publishing' : 'saving a draft'}`, async () => {
    const route = editor({ eligibilityCode: 'eligible', mismatchedSeason: true });
    await assert.rejects(route.run(publish), error => error.statusCode === 404);
    assert.equal(route.availabilityCalls, 0);
    assert.equal(route.writes.length, 0);
  });
}

test('a supplied published recap from another show cannot bypass eligibility or be edited', async () => {
  const route = editor({ existingStatus: 'published', mismatchedRecap: true });
  await assert.rejects(route.run(true), error => error.statusCode === 404);
  assert.equal(route.availabilityCalls, 0);
  assert.equal(route.writes.length, 0);
});
