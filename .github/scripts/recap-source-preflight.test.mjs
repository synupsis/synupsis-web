import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const projectRoot = new URL('../../', import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('~/')) return { url: new URL(`${specifier.slice(2)}.ts`, projectRoot).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const config = await import('../../server/services/recap-generation/config.ts');
const utils = await import('../../server/services/recap-generation/utils.ts');
const registry = await import('../../server/services/recap-source-registry.ts');

function loadModule(path, dependencies, globals) {
  const source = readFileSync(new URL(path, projectRoot), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(compiled, {
    module, exports: module.exports, console: { warn() {} },
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    },
    ...globals,
  });
  return module.exports;
}

function sourcePipeline({ usableSubtitles = true, summarySucceeds = true, strictRights = false } = {}) {
  let modelCalls = 0;
  let downloads = 0;
  const requests = [];
  const secretTranscript = 'TRANSCRIPT_ONLY_IN_MEMORY: Alice finds the letter and tells Bob the truth. ';
  const openai = {
    getRecapModel: () => 'test-model',
    createOpenAIClient: () => ({ responses: { async create(input) {
      modelCalls += 1;
      return { output_text: typeof input.input === 'string'
        ? (summarySucceeds ? 'Alice finds the letter and tells Bob the truth. '.repeat(20) : '')
        : JSON.stringify({ images: [{ index: 1, x: 30, y: 40 }] }) };
    } } }),
  };
  const policies = {
    ...registry,
    getRecapSourcePolicyMode: () => strictRights ? 'enforce' : 'audit',
    getRecapSourceApprovals: () => ['subdl'],
    evaluateRecapSourceRights: providers => registry.evaluateRecapSourceRights(providers, strictRights ? 'enforce' : 'audit', ['subdl']),
  };
  const globals = {
    process: { env: { OPENAI_API_KEY: 'fixture', TMDB_API_KEY: 'fixture' } },
    $fetch: async (url) => {
      requests.push(url);
      if (url.endsWith('/images')) return { stills: [{ file_path: '/episode.jpg' }], backdrops: [{ file_path: '/backdrop.jpg' }] };
      return { episodes: [] };
    },
  };
  const subtitles = loadModule('server/services/subtitle-recap-source.ts', {
    '~/server/services/recap-generation/openai': openai,
    '~/server/services/recap-source-registry': policies,
    '~/server/services/subtitle-providers/opensubtitles': { openSubtitlesProvider: { id: 'opensubtitles', isConfigured: () => false } },
    '~/server/services/subtitle-providers/subdl': { subdlProvider: {
      id: 'subdl', isConfigured: () => true,
      search: async query => [
        { key: `broken-${query.episodeNumber}`, language: 'en', hearingImpaired: false, downloadCount: 2, url: null, download: async () => { throw new Error('Broken download'); } },
        { key: `fixture-${query.episodeNumber}`, language: 'en', hearingImpaired: false, downloadCount: 1, url: 'https://example.test/subtitle',
          download: async () => { downloads += 1; return `1\n00:00:01,000 --> 00:00:02,000\n${usableSubtitles ? secretTranscript.repeat(70) : 'A teaser'}`; } },
      ],
    } },
  }, globals);
  const sources = loadModule('server/services/recap-generation/sources.ts', {
    '~/server/services/recap-generation/config': config,
    '~/server/services/recap-generation/openai': openai,
    '~/server/services/recap-generation/utils': utils,
    '~/server/services/recap-source-registry': policies,
    '~/server/services/subtitle-recap-source': subtitles,
    '~/server/services/wikimedia-recap-source': { fetchWikimediaRecapEnrichment: async () => null },
    '~/server/utils/trakt': { createTraktHeaders: () => ({}) },
  }, globals);
  return { sources, requests, get modelCalls() { return modelCalls; }, get downloads() { return downloads; } };
}

const input = {
  showId: 'show-1', seasonId: 'season-1', showName: 'Example', showTraktId: 1,
  showGenres: [], showOverview: null, showImage: null, seasonNumber: 1,
  seasonFirstAired: '2020-01-01', seasonImage: null,
  traktData: { episodes: [1, 2].map(number => ({ number, title: `Episode ${number}`, overview: 'Short teaser' })), show: { ids: { tmdb: 123 }, language: 'en' }, seasons: [] },
};

test('source preflight validates actual subtitle files without AI or refetching validated Trakt metadata', async () => {
  const pipeline = sourcePipeline();
  const prepared = await pipeline.sources.fetchRecapSourceSnapshot(input);
  assert.equal(pipeline.downloads, 2);
  assert.equal(pipeline.modelCalls, 0);
  assert.ok(pipeline.requests.every(url => !url.includes('trakt.tv')));
  assert.equal(pipeline.sources.evaluatePreparedRecapSourceReadiness(prepared).ready, true);
  assert.equal(pipeline.sources.evaluateRecapSourceReadiness(prepared.snapshot).ready, false);
  assert.ok(!JSON.stringify(prepared.snapshot).includes('TRANSCRIPT_ONLY_IN_MEMORY'));

  const snapshot = await pipeline.sources.enrichRecapSourceSnapshot(prepared);
  assert.equal(pipeline.modelCalls, 3); // two summaries, one vision batch, after admission
  assert.equal(pipeline.sources.evaluateRecapSourceReadiness(snapshot).ready, true);
  assert.ok(!JSON.stringify(snapshot).includes('TRANSCRIPT_ONLY_IN_MEMORY'));
});

test('unusable subtitle files and teaser-only sources fail the free preflight', async () => {
  const pipeline = sourcePipeline({ usableSubtitles: false });
  const prepared = await pipeline.sources.fetchRecapSourceSnapshot(input);
  assert.equal(prepared.subtitles, null);
  assert.equal(pipeline.sources.evaluatePreparedRecapSourceReadiness(prepared).ready, false);
  assert.equal(pipeline.modelCalls, 0);
});

test('source rights in enforce mode fail before model calls', async () => {
  const pipeline = sourcePipeline({ strictRights: true });
  const prepared = await pipeline.sources.fetchRecapSourceSnapshot(input);
  const readiness = pipeline.sources.evaluatePreparedRecapSourceReadiness(prepared);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.issues.includes('source_rights_not_cleared'));
  assert.equal(pipeline.modelCalls, 0);
});

test('failed paid summaries do not trigger additional vision cost', async () => {
  const pipeline = sourcePipeline({ summarySucceeds: false });
  const prepared = await pipeline.sources.fetchRecapSourceSnapshot(input);
  assert.equal(pipeline.sources.evaluatePreparedRecapSourceReadiness(prepared).ready, true);
  const snapshot = await pipeline.sources.enrichRecapSourceSnapshot(prepared);
  assert.equal(pipeline.modelCalls, 2);
  assert.equal(pipeline.sources.evaluateRecapSourceReadiness(snapshot).ready, false);
});

function sourceEpisode(number, length) {
  return { number, evidence: [{ text: 'a'.repeat(length) }] };
}

test('source coverage keeps the 60 percent boundary when the finale is documented', () => {
  const { sources } = sourcePipeline();
  const episode = (chars, index) => sourceEpisode(index + 1, chars);
  assert.equal(sources.evaluateRecapSourceReadiness({ episodes: [] }).ready, false);
  assert.equal(sources.evaluateRecapSourceReadiness({ episodes: [400, 400, 0, 0, 400].map(episode) }).ready, true);
  const tooFew = sources.evaluateRecapSourceReadiness({ episodes: [400, 399, 0, 0, 400].map(episode) });
  assert.equal(tooFew.ready, false);
  assert.deepEqual(Array.from(tooFew.issues), ['insufficient_episode_sources']);
});

test('60 percent source coverage is insufficient when the finale has only a teaser', () => {
  const { sources } = sourcePipeline();
  const snapshot = { episodes: [400, 400, 400, 0, 399].map((chars, index) => sourceEpisode(index + 1, chars)) };
  const readiness = sources.evaluateRecapSourceReadiness(snapshot);
  assert.equal(sources.evaluatePreparedRecapSourceReadiness({ snapshot: { ...snapshot, providers: [] }, subtitles: null }).ready, false);
  assert.equal(readiness.documentedRatio, 0.6);
  assert.equal(readiness.ready, false);
  assert.deepEqual(Array.from(readiness.issues), ['insufficient_finale_source']);
  assert.match(sources.describeInsufficientSources(readiness), /dernier épisode/);
});

test('the finale is the highest episode number, regardless of input order', () => {
  const { sources } = sourcePipeline();
  const snapshot = { episodes: [sourceEpisode(5, 399), sourceEpisode(1, 400), sourceEpisode(4, 400), sourceEpisode(3, 400), sourceEpisode(2, 400)] };
  assert.equal(sources.evaluateRecapSourceReadiness(snapshot).ready, false);
  snapshot.episodes[0] = sourceEpisode(5, 400);
  assert.equal(sources.evaluateRecapSourceReadiness(snapshot).ready, true);
});

test('a usable finale transcript rescues the free preflight but its failed summary still blocks extraction', async () => {
  const pipeline = sourcePipeline({ summarySucceeds: false });
  const finaleInput = {
    ...input,
    traktData: { ...input.traktData, episodes: [
      { number: 3, title: 'Finale', overview: 'Short teaser' },
      { number: 1, title: 'Premiere', overview: 'Alice searches for the letter. '.repeat(70) },
      { number: 2, title: 'Middle', overview: 'Bob discovers where the letter was hidden. '.repeat(70) },
    ] },
  };
  const prepared = await pipeline.sources.fetchRecapSourceSnapshot(finaleInput);
  const writtenReadiness = pipeline.sources.evaluateRecapSourceReadiness(prepared.snapshot);
  assert.equal(writtenReadiness.documentedRatio, 0.67);
  assert.deepEqual(Array.from(writtenReadiness.issues), ['insufficient_finale_source']);
  assert.equal(pipeline.sources.evaluatePreparedRecapSourceReadiness(prepared).ready, true);
  assert.equal(pipeline.modelCalls, 0);
  assert.equal(pipeline.downloads, 1);
  const snapshot = await pipeline.sources.enrichRecapSourceSnapshot(prepared);
  const readiness = pipeline.sources.evaluateRecapSourceReadiness(snapshot);
  assert.equal(readiness.ready, false);
  assert.deepEqual(Array.from(readiness.issues), ['insufficient_finale_source']);
  assert.equal(pipeline.modelCalls, 1); // failed summary, no vision cost
});
