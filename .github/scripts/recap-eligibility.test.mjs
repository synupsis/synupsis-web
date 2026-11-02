import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import {
  evaluateSeasonRecapEligibility,
  parseRecapReleaseTimestamp,
  recapEligibility,
} from '../../lib/recap-eligibility.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('~/')) {
      return { url: new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { fetchSeasonRecapAvailability, assertRecapEligible } = await import('../../server/services/recap-eligibility.ts');

const now = Date.parse('2026-10-25T01:30:00.000Z');
const fixtures = () => ({
  seasonNumber: 2,
  now,
  season: { number: 2, episode_count: 2, aired_episodes: 2, first_aired: '2026-10-01T00:00:00.000Z' },
  episodes: [
    { number: 1, season: 2, first_aired: '2026-10-01T00:00:00.000Z' },
    { number: 2, season: 2, first_aired: '2026-10-25T01:30:00.000Z' },
  ],
});

test('a season becomes eligible at the exact final episode instant', () => {
  const input = fixtures();
  assert.equal(evaluateSeasonRecapEligibility(input).code, 'eligible');
  input.now -= 1;
  input.season.aired_episodes = 1;
  assert.equal(evaluateSeasonRecapEligibility(input).code, 'season_in_progress');
  input.now += 2;
  input.season.aired_episodes = 2;
  assert.equal(evaluateSeasonRecapEligibility(input).code, 'eligible');
});

test('explicit offsets describe one instant even across the autumn clock change', () => {
  for (const timestamp of ['2026-10-25T02:30:00+01:00', '2026-10-24T18:30:00-07:00', '2026-10-25T01:30:00Z']) {
    const input = fixtures();
    input.episodes[1].first_aired = timestamp;
    assert.equal(evaluateSeasonRecapEligibility(input).eligible, true);
  }
  const future = fixtures();
  future.episodes[1].first_aired = '2026-10-25T02:30:00+00:00';
  future.season.aired_episodes = 1;
  assert.equal(evaluateSeasonRecapEligibility(future).code, 'season_in_progress');
});

test('all episodes in the future report a season not yet aired', () => {
  const input = fixtures();
  input.now = Date.parse('2026-09-01T00:00:00Z');
  input.season.aired_episodes = 0;
  assert.equal(evaluateSeasonRecapEligibility(input).code, 'not_yet_aired');
});

test('season completion is independent of following seasons and show renewal', () => {
  const input = { ...fixtures(), show: { status: 'returning series' }, nextSeason: { number: 3 } };
  assert.equal(evaluateSeasonRecapEligibility(input).eligible, true);
  input.episodes[1].episode_type = 'season_finale';
  assert.equal(evaluateSeasonRecapEligibility(input).eligible, true);
});

test('an explicit mid-season finale does not certify a full season', () => {
  const input = fixtures();
  input.episodes[1].episode_type = 'mid_season_finale';
  assert.equal(evaluateSeasonRecapEligibility(input).code, 'season_in_progress');
});

test('no season-level premiere or aired count is necessary when complete episode dates prove release', () => {
  const input = fixtures();
  delete input.season.first_aired;
  delete input.season.aired_episodes;
  assert.equal(evaluateSeasonRecapEligibility(input).eligible, true);
});

test('special seasons retain their existing exclusion', () => {
  assert.equal(evaluateSeasonRecapEligibility({ ...fixtures(), seasonNumber: 0 }).code, 'special_season');
  for (const seasonNumber of [-1, 1.5, NaN]) {
    assert.equal(evaluateSeasonRecapEligibility({ ...fixtures(), seasonNumber }).code, 'metadata_inconsistent');
  }
});

for (const missing of [undefined, null, '', 'unknown', '2026-10-25', '2026-10-25T01:30:00', '0001-01-01T00:00:00Z']) {
  test(`missing or ambiguous episode release does not become available: ${String(missing)}`, () => {
    const input = fixtures();
    input.episodes[1].first_aired = missing;
    assert.equal(evaluateSeasonRecapEligibility(input).code, 'metadata_incomplete');
  });
}

test('strict calendar parsing rejects rollover dates, invalid times and malformed zones', () => {
  for (const timestamp of [
    '2026-02-29T00:00:00Z', '2024-02-30T00:00:00Z', '2026-04-31T00:00:00Z',
    '2026-13-01T00:00:00Z', '2026-01-00T00:00:00Z', '2026-01-01T24:00:00Z',
    '2026-01-01T00:60:00Z', '2026-01-01T00:00:60Z', '2026-01-01T00:00:00+25:00',
    '2026-01-01T00:00:00+01:60', '2026-01-01T00:00:00+14:01', ' 2026-01-01T00:00:00Z',
  ]) assert.equal(parseRecapReleaseTimestamp(timestamp), null, timestamp);
  assert.equal(parseRecapReleaseTimestamp('2024-02-29T00:00:00Z'), Date.parse('2024-02-29T00:00:00Z'));
});

test('missing season totals or episode lists fail closed', () => {
  for (const input of [
    { ...fixtures(), season: undefined }, { ...fixtures(), episodes: undefined },
    { ...fixtures(), episodes: [] }, { ...fixtures(), episodes: [null, null] },
    { ...fixtures(), season: { number: 2 } }, { ...fixtures(), season: { number: 2, episode_count: 0 } },
  ]) assert.equal(evaluateSeasonRecapEligibility(input).code, 'metadata_incomplete');
});

test('episode counts, unique numbering, season association and totals must agree', () => {
  for (const edit of [
    input => { input.season.episode_count = 3; },
    input => { input.season.episode_count = '2'; },
    input => { input.season.number = 1; },
    input => { input.episodes[1].number = 1; },
    input => { input.episodes[1].number = 3; },
    input => { input.episodes[1].number = 2.5; },
    input => { input.episodes[0].number = 0; },
    input => { input.episodes[1].season = 1; },
    input => { input.season.aired_episodes = 1; },
    input => { input.season.aired_episodes = 3; },
    input => { input.season.aired_episodes = -1; },
    input => { input.season.aired_episodes = '2'; },
  ]) {
    const input = fixtures();
    edit(input);
    assert.equal(evaluateSeasonRecapEligibility(input).code, 'metadata_inconsistent');
  }
});

test('an aired count cannot override a future episode date', () => {
  const input = fixtures();
  input.episodes[1].first_aired = '2026-12-01T00:00:00Z';
  assert.equal(evaluateSeasonRecapEligibility(input).code, 'metadata_inconsistent');
});

test('a season cannot start after an already released episode', () => {
  const input = fixtures();
  input.season.first_aired = '2026-12-01T00:00:00Z';
  assert.equal(evaluateSeasonRecapEligibility(input).code, 'metadata_inconsistent');
  input.season.first_aired = 'invalid';
  assert.equal(evaluateSeasonRecapEligibility(input).code, 'metadata_incomplete');
});

test('episode listing order does not affect eligibility', () => {
  const input = fixtures();
  input.episodes.reverse();
  assert.equal(evaluateSeasonRecapEligibility(input).eligible, true);
});

test('structured refusals include a stable code and message', () => {
  assert.doesNotThrow(() => assertRecapEligible(recapEligibility('eligible')));
  for (const code of ['metadata_incomplete', 'season_in_progress', 'insufficient_sources']) {
    assert.throws(() => assertRecapEligible(recapEligibility(code)), error => {
      assert.equal(error.statusCode, 422);
      assert.equal(error.data.code, 'recap_ineligible');
      assert.equal(error.data.eligibility.code, code);
      assert.ok(error.data.eligibility.message.length > 0);
      return true;
    });
  }
  assert.throws(() => assertRecapEligible(recapEligibility('availability_unavailable')), { statusCode: 503 });
});

test('fresh provider reads return the same validated raw data for source gathering', async t => {
  const input = fixtures();
  const calls = [];
  t.mock.method(Date, 'now', () => now);
  const originalClientId = process.env.TRAKT_CLIENT_ID;
  process.env.TRAKT_CLIENT_ID = 'fixture-client';
  globalThis.$fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/seasons/2?extended=full')) return input.episodes;
    if (url.endsWith('/seasons?extended=full')) return [input.season];
    return { ids: { trakt: 42 }, status: 'returning series' };
  };
  t.after(() => {
    delete globalThis.$fetch;
    if (originalClientId === undefined) delete process.env.TRAKT_CLIENT_ID;
    else process.env.TRAKT_CLIENT_ID = originalClientId;
  });
  const response = await fetchSeasonRecapAvailability(42, 2);
  assert.equal(response.eligibility.eligible, true);
  assert.equal(response.traktData.episodes, input.episodes);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.options.timeout === 15_000));
  assert.ok(calls.every(call => call.options.headers['trakt-api-key'] === 'fixture-client'));
  await fetchSeasonRecapAvailability(42, 2);
  assert.equal(calls.length, 6, 'the eligibility read must not reuse a stale positive cache');
});

test('provider outages, malformed responses and duplicate seasons never approve generation', async t => {
  const originalClientId = process.env.TRAKT_CLIENT_ID;
  process.env.TRAKT_CLIENT_ID = 'fixture-client';
  t.after(() => {
    delete globalThis.$fetch;
    if (originalClientId === undefined) delete process.env.TRAKT_CLIENT_ID;
    else process.env.TRAKT_CLIENT_ID = originalClientId;
  });
  globalThis.$fetch = async () => { throw new Error('Provider unavailable'); };
  assert.equal((await fetchSeasonRecapAvailability(42, 2)).eligibility.code, 'availability_unavailable');
  globalThis.$fetch = async () => null;
  assert.equal((await fetchSeasonRecapAvailability(42, 2)).eligibility.code, 'metadata_incomplete');
  globalThis.$fetch = async url => url.endsWith('/seasons?extended=full')
    ? [fixtures().season, fixtures().season]
    : url.includes('/seasons/2') ? fixtures().episodes : {};
  assert.equal((await fetchSeasonRecapAvailability(42, 2)).eligibility.code, 'metadata_inconsistent');
});

test('missing provider configuration, invalid identifiers and specials make no external call', async t => {
  const originalClientId = process.env.TRAKT_CLIENT_ID;
  delete process.env.TRAKT_CLIENT_ID;
  globalThis.$fetch = async () => assert.fail('No provider call expected');
  t.after(() => {
    delete globalThis.$fetch;
    if (originalClientId !== undefined) process.env.TRAKT_CLIENT_ID = originalClientId;
  });
  assert.equal((await fetchSeasonRecapAvailability(42, 2)).eligibility.code, 'availability_unavailable');
  assert.equal((await fetchSeasonRecapAvailability(null, 2)).eligibility.code, 'availability_unavailable');
  assert.equal((await fetchSeasonRecapAvailability(42, 0)).eligibility.code, 'special_season');
});
