import assert from 'node:assert/strict'
import test from 'node:test'

const { isSeasonReleased } = await import('../../lib/season-availability.ts')

const now = Date.parse('2026-07-22T12:00:00.000Z')

test('masque une saison sans date de diffusion exploitable', () => {
  assert.equal(isSeasonReleased(null, now), false)
  assert.equal(isSeasonReleased('', now), false)
  assert.equal(isSeasonReleased('date inconnue', now), false)
  assert.equal(isSeasonReleased('0001-01-01T00:00:00.000Z', now), false)
})

test('affiche uniquement les saisons déjà sorties', () => {
  assert.equal(isSeasonReleased('2026-07-22T12:00:00.000Z', now), true)
  assert.equal(isSeasonReleased('2025-05-10T18:00:00.000Z', now), true)
  assert.equal(isSeasonReleased('2026-07-22T12:00:01.000Z', now), false)
  assert.equal(isSeasonReleased('2027-01-01T00:00:00.000Z', now), false)
})
