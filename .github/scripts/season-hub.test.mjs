import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('~/')) {
      return { url: new URL(`${specifier.slice(2)}.ts`, projectRoot).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const { buildSeasonHub, findCorrectionTarget } = await import('../../server/services/season-hub.ts')

const baseInput = {
  show: {
    id: 'show-id', name: 'Série test', slug: 'serie-test-42', image: null,
    summary: 'Un contexte sans spoiler.', genres: ['drama'],
  },
  season: {
    id: 'season-id', number: 1, name: 'Saison 1', image: null, firstAired: '2026-01-01',
  },
  recapId: 'recap-id',
  sourceSnapshot: {
    providers: [{ id: 'reference', label: 'Référence', sourceUrl: 'https://example.com', licenseName: 'Test' }],
    season: { evidence: [] },
    episodes: Array.from({ length: 4 }, (_, index) => ({
      number: index + 1,
      title: `Épisode ${index + 1}`,
      overview: `Résumé ${index + 1}`,
      evidence: [{
        id: `evidence-${index + 1}`, providerId: 'reference', sourceUrl: `https://example.com/${index + 1}`,
      }],
    })),
  },
  eventGraph: {
    events: [
      {
        id: 'event-001', title: 'Premier choix', description: 'Alice fait un choix.',
        episodeNumbers: [1], characters: ['Alice'], arc: 'Départ', importance: 'major',
        evidenceIds: ['evidence-1'], confidence: 0.9,
      },
      {
        id: 'event-002', title: 'Secret révélé', description: 'Bob révèle un secret commencé plus tôt.',
        episodeNumbers: [2, 4], characters: ['Bob'], arc: 'Secret', importance: 'critical',
        evidenceIds: ['evidence-4'], confidence: 0.8,
      },
    ],
  },
  corrections: [{
    id: 'correction-id', target_type: 'event', target_key: 'event-002', field: 'description',
    current_value: 'Bob révèle un secret commencé plus tôt.', proposed_value: 'Correction', reason: 'Une raison vérifiable.',
    source_url: null, reveal_episode: 4, created_at: '2026-01-02', votes: [],
  }],
}

test('le serveur exclut intégralement un événement qui se termine après le curseur', () => {
  const hub = buildSeasonHub({ ...baseInput, requestedThroughEpisode: 2 })
  assert.deepEqual(hub.episodes.map(episode => episode.number), [1, 2])
  assert.deepEqual(hub.events.map(event => event.id), ['event-001'])
  assert.deepEqual(hub.characters.map(character => character.name), ['Alice'])
  assert.equal(hub.corrections.length, 0)
  assert.equal(hub.recap.unlocked, false)
  assert.equal(hub.recap.id, null)
})

test('la saison terminée débloque le recap et les informations finales', () => {
  const hub = buildSeasonHub({ ...baseInput, requestedThroughEpisode: 99 })
  assert.equal(hub.progress.throughEpisode, 4)
  assert.equal(hub.progress.isComplete, true)
  assert.equal(hub.recap.id, 'recap-id')
  assert.deepEqual(hub.events.map(event => event.id), ['event-001', 'event-002'])
  assert.equal(hub.corrections.length, 1)
})

test('une correction acceptée remplace le champ seulement après son épisode de révélation', () => {
  const override = {
    target_type: 'event', target_key: 'event-001', field: 'title', value: 'Titre vérifié', reveal_episode: 1,
  }
  const before = buildSeasonHub({ ...baseInput, requestedThroughEpisode: 0, overrides: [override] })
  const after = buildSeasonHub({ ...baseInput, requestedThroughEpisode: 1, overrides: [override] })
  assert.equal(before.events.length, 0)
  assert.equal(after.events[0].title, 'Titre vérifié')
  assert.equal(findCorrectionTarget(after, 'event', 'event-001', 'title'), 'Titre vérifié')
})
