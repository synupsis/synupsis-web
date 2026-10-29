import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
function context({ signedIn = true, body = {}, recap = { status: 'published', slides: [{ id: 'stored' }] }, planned = null, rpcError = null, rpcData = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } = {}) {
  const calls = [];
  const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: recap, error: null }; } };
  const service = { rpc: async (name, args) => { calls.push({ name, args: JSON.parse(JSON.stringify(args)) }); return { data: rpcData, error: rpcError }; } };
  function load(path) {
    const compiled = ts.transpileModule(readFileSync(new URL(path, root), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    runInNewContext(compiled, {
      module, exports: module.exports, console: { error() {} },
      defineEventHandler: handler => handler,
      createError: options => Object.assign(new Error(options.statusMessage), options),
      readBody: async () => body,
      require: name => {
        if (name === '#supabase/server') return {
          serverSupabaseUser: async () => signedIn ? { sub: 'viewer' } : null,
          serverSupabaseClient: async () => ({ from: () => query }),
          serverSupabaseServiceRole: () => service,
        };
        if (name === '~/server/utils/recap-story-plan') return { getRecapStoryPlan: () => planned };
        throw new Error(`Unexpected dependency ${name}`);
      },
    });
    return () => module.exports.default({ context: { params: { id: 'recap' } } });
  }
  return { calls, start: load('server/api/recap/[id]/view-session.post.ts'), progress: load('server/api/recap/[id]/view.post.ts') };
}

test('a bare view POST cannot create a reward', async () => {
  for (const body of [{}, { slideIndex: 1 }, { sessionId: 'invalid', slideIndex: 0 }, { sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }]) {
    const ctx = context({ body });
    await assert.rejects(ctx.progress(), { statusCode: 400 });
    assert.equal(ctx.calls.length, 0);
  }
});

test('both reading endpoints require an authenticated user', async () => {
  const ctx = context({ signedIn: false });
  await assert.rejects(ctx.start(), { statusCode: 401 });
  await assert.rejects(ctx.progress(), { statusCode: 401 });
  assert.equal(ctx.calls.length, 0);
});

test('session size comes from the server display plan, ignoring client counts', async () => {
  const ctx = context({ body: { slideIndex: 2, slideCount: 1, seenSlides: [0, 1, 2] }, planned: [{}, {}, {}, {}, {}] });
  const result = await ctx.start();
  assert.equal(result.complete, false);
  assert.deepEqual(ctx.calls, [{ name: 'start_recap_view_session', args: {
    p_recap_id: 'recap', p_user_id: 'viewer', p_slide_count: 5, p_slide_index: 2,
  } }]);
});

test('legacy recaps use their stored slide count and out-of-range starts are rejected', async () => {
  const ctx = context({ body: { slideIndex: 0 } });
  await ctx.start();
  assert.equal(ctx.calls[0].args.p_slide_count, 1);
  for (const slideIndex of [-1, 1, 2.5, '0']) {
    const invalid = context({ body: { slideIndex } });
    await assert.rejects(invalid.start(), { statusCode: 400 });
    assert.equal(invalid.calls.length, 0);
  }
});

test('missing/unpublished recaps cannot start a session', async () => {
  const ctx = context({ body: { slideIndex: 0 }, recap: null });
  await assert.rejects(ctx.start(), { statusCode: 404 });
  assert.equal(ctx.calls.length, 0);
});

test('already rewarded views need no further tracking', async () => {
  const ctx = context({ body: { slideIndex: 0 }, rpcData: null });
  const result = await ctx.start();
  assert.equal(result.sessionId, null);
  assert.equal(result.complete, true);
});

test('progress binds session, recap and authenticated viewer; clients cannot claim elapsed time', async () => {
  const sessionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  for (const slideIndex of [0, null]) {
    const ctx = context({ body: { sessionId, slideIndex, userId: 'owner', elapsedMs: 999999, complete: true }, rpcData: false });
    const result = await ctx.progress();
    assert.equal(result.complete, false);
    assert.deepEqual(ctx.calls, [{ name: 'record_recap_view_progress', args: {
      p_session_id: sessionId, p_recap_id: 'recap', p_user_id: 'viewer', p_slide_index: slideIndex,
    } }]);
  }
});

test('expired/mismatched sessions and invalid indices surface recoverable errors', async () => {
  const body = { sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', slideIndex: 0 };
  for (const [code, statusCode] of [['P0002', 409], ['22023', 400], ['XX000', 500]]) {
    const ctx = context({ body, rpcError: { code } });
    await assert.rejects(ctx.progress(), { statusCode });
  }
});
