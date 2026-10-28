import assert from 'node:assert/strict';
import test from 'node:test';
import { lastConfirmedAiredEpisode } from '../../lib/watching-progress.ts';

const now = Date.parse('2026-10-28T12:00:00Z');
const episode = (number, firstAired = '2020-01-01T12:00:00Z') => ({ number, firstAired });

test('finds the highest aired episode number in an unordered catalogue with gaps without mutating it', () => {
  const entries = [episode(8), episode(1), episode(3)];
  const before = structuredClone(entries);
  assert.equal(lastConfirmedAiredEpisode(entries, now), 8);
  assert.deepEqual(entries, before);
});

test('includes an episode at its air time while excluding episodes that air later', () => {
  const entries = [
    episode(1),
    episode(2, new Date(now).toISOString()),
    episode(3, new Date(now + 1).toISOString()),
  ];
  assert.equal(lastConfirmedAiredEpisode(entries, now), 2);
  assert.equal(lastConfirmedAiredEpisode(entries, now + 1), 3);
});

test('cannot confirm the latest episode from an empty or entirely unaired catalogue', () => {
  assert.equal(lastConfirmedAiredEpisode([], now), null);
  assert.equal(lastConfirmedAiredEpisode([episode(1, '2999-01-01T12:00:00Z')], now), null);
});

for (const firstAired of [null, '', 'not-a-date']) {
  test(`a missing or invalid air date ${JSON.stringify(firstAired)} leaves the latest episode unconfirmed`, () => {
    assert.equal(lastConfirmedAiredEpisode([episode(1), episode(2, firstAired)], now), null);
  });
}
