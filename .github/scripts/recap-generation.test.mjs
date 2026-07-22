import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('~/')) {
      return {
        url: new URL(`${specifier.slice(2)}.ts`, projectRoot).href,
        shortCircuit: true,
      }
    }
    return nextResolve(specifier, context)
  },
})

const {
  buildRecapSlides,
  createEventExtractionPrompt,
  createRecapPrompt,
  evaluateRecapEventGraph,
  evaluateRecapStory,
  normalizeRecapEventGraph,
  normalizeRecapStory,
} = await import('../../server/services/recap-generation.ts')
const {
  createRecapSourceProvider,
  evaluateRecapSourceRights,
} = await import('../../server/services/recap-source-registry.ts')
const {
  getMissingRecapPromptVariables,
  isRecapPromptCompatible,
} = await import('../../lib/prompts/defaultPrompt.ts')

const fetchedAt = '2026-07-22T12:00:00.000Z'
const providers = [createRecapSourceProvider('trakt', fetchedAt, 'https://trakt.tv/shows/test')]
const snapshot = {
  provider: 'multi-source',
  fetchedAt,
  providers,
  rights: evaluateRecapSourceRights(providers, 'audit'),
  show: {
    id: 'show-id',
    traktId: 42,
    tmdbId: 43,
    tvdbId: 44,
    imdbId: 'tt0000042',
    wikidataId: 'Q42',
    name: 'Série test',
    genres: ['drama'],
    overview: 'Une série utilisée pour tester le pipeline.',
    image: 'https://walter-r2.trakt.tv/show.webp',
  },
  season: {
    id: 'season-id',
    number: 1,
    firstAired: '2026-01-01',
    image: null,
    evidence: [],
  },
  episodes: Array.from({ length: 8 }, (_, index) => {
    const number = index + 1
    const overview = `Synopsis source suffisamment précis pour établir les faits importants de l'épisode ${number}.`
    return {
      number,
      title: `Épisode ${number}`,
      overview,
      image: `https://walter-r2.trakt.tv/episode-${number}.webp`,
      runtime: 45,
      rating: 8,
      traktId: 100 + index,
      evidence: [{
        id: `trakt-e${number}-overview`,
        providerId: 'trakt',
        kind: 'episode-synopsis',
        episodeNumber: number,
        locale: 'en',
        text: overview,
        sourceUrl: `https://trakt.tv/episode-${number}`,
        trustTier: 'reference',
        licenseId: 'trakt-api-terms',
        retrievedAt: fetchedAt,
        revisionId: null,
      }],
    }
  }),
}

function createRawEventGraph() {
  return {
    events: Array.from({ length: 8 }, (_, index) => {
      const number = index + 1
      return {
        id: `event-${String(number).padStart(3, '0')}`,
        title: `Événement ${number}`,
        description: `Un fait vérifiable fait avancer l'intrigue pendant l'épisode ${number}.`,
        episodeNumbers: [number],
        characters: [`Personnage ${number}`],
        arc: number < 5 ? 'Mise en place' : 'Résolution',
        importance: number % 3 === 0 ? 'critical' : 'major',
        evidenceIds: [`trakt-e${number}-overview`],
        causedByEventIds: number > 1 ? [`event-${String(number - 1).padStart(3, '0')}`] : [],
        consequenceEventIds: number < 8 ? [`event-${String(number + 1).padStart(3, '0')}`] : [],
        contradictionEvidenceIds: [],
      }
    }),
  }
}

function createEventGraph() {
  return normalizeRecapEventGraph(createRawEventGraph(), snapshot)
}

function createRawStory() {
  return {
    cover: {
      title: 'Série test',
      subtitle: 'Saison 1',
      logline: 'Les décisions qui changent toute la saison.',
    },
    beats: [
      createBeat('Le point de départ', [1, 2], 1),
      createBeat('La première rupture', [3], 3),
      createBeat('Les conséquences', [4, 5], 5),
      createBeat('Le choix décisif', [6], 6),
      createBeat('Le dénouement', [7, 8], 8),
    ],
  }
}

function createBeat(headline, episodeNumbers, imageEpisodeNumber) {
  return {
    headline,
    narration: `Un moment factuel étayé par les événements des épisodes ${episodeNumbers.join(' et ')}.`,
    tag: 'Moment clé',
    episodeNumbers,
    imageEpisodeNumber,
    eventIds: episodeNumbers.map(number => `event-${String(number).padStart(3, '0')}`),
  }
}

test('valide un graphe d’événements intégralement rattaché aux preuves', () => {
  const eventGraph = createEventGraph()
  const quality = evaluateRecapEventGraph(eventGraph, snapshot)

  assert.equal(quality.publishable, true)
  assert.equal(quality.referenceValidity, 1)
  assert.equal(quality.evidenceCoverage, 1)
  assert.equal(quality.episodeCoverage, 1)
  assert.deepEqual(quality.issues, [])
})

test('publie un récit couvrant les événements importants de la saison', () => {
  const eventGraph = createEventGraph()
  const story = normalizeRecapStory(createRawStory(), snapshot, eventGraph)
  const quality = evaluateRecapStory(story, snapshot, eventGraph)

  assert.equal(quality.publishable, true)
  assert.equal(quality.referenceValidity, 1)
  assert.equal(quality.eventCoverage, 1)
  assert.equal(quality.episodeCoverage, 1)
  assert.deepEqual(quality.issues, [])
})

test('sépare les sources brutes du prompt de rédaction', () => {
  const eventGraph = createEventGraph()
  const extractionPrompt = createEventExtractionPrompt(snapshot)
  const storyPrompt = createRecapPrompt(snapshot, eventGraph)

  assert.match(extractionPrompt, /\[trakt-e1-overview\]/)
  assert.match(extractionPrompt, /trakt\/en\/reference\/trakt-api-terms/)
  assert.match(storyPrompt, /\[event-001\]/)
  assert.doesNotMatch(storyPrompt, /Synopsis source suffisamment précis/)
})

test('bloque les références de preuve et les liens causaux invalides', () => {
  const rawEventGraph = createRawEventGraph()
  rawEventGraph.events[0].evidenceIds = ['preuve-inconnue']
  rawEventGraph.events[1].causedByEventIds = ['event-999']

  const eventGraph = normalizeRecapEventGraph(rawEventGraph, snapshot)
  const quality = evaluateRecapEventGraph(eventGraph, snapshot)

  assert.equal(quality.publishable, false)
  assert.ok(quality.referenceValidity < 1)
  assert.ok(quality.causalIntegrity < 1)
  assert.ok(quality.issues.includes('invalid_event_references'))
  assert.ok(quality.issues.includes('invalid_causal_links'))
})

test('bloque une slide qui cite un événement absent', () => {
  const eventGraph = createEventGraph()
  const rawStory = createRawStory()
  rawStory.beats[1].eventIds = ['event-999']

  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)
  const quality = evaluateRecapStory(story, snapshot, eventGraph)

  assert.equal(quality.publishable, false)
  assert.ok(quality.referenceValidity < 1)
  assert.ok(quality.evidenceCoverage < 1)
  assert.ok(quality.issues.includes('invalid_story_references'))
  assert.ok(quality.issues.includes('uncited_story_beats'))
})

test('le serveur dérive les preuves depuis les événements cités', () => {
  const eventGraph = createEventGraph()
  const story = normalizeRecapStory(createRawStory(), snapshot, eventGraph)

  assert.deepEqual(story.beats[0].evidenceIds, ['trakt-e1-overview', 'trakt-e2-overview'])
})

test('conserve intégralement une narration longue au lieu d’ajouter une ellipse', () => {
  const eventGraph = createEventGraph()
  const rawStory = createRawStory()
  const longNarration = `${'Une conséquence factuelle clairement sourcée se développe. '.repeat(8)}Fin complète.`
  rawStory.beats[0].narration = longNarration

  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)
  const quality = evaluateRecapStory(story, snapshot, eventGraph)

  assert.equal(story.beats[0].narration, longNarration.trim())
  assert.equal(story.beats[0].narration.endsWith('…'), false)
  assert.equal(quality.issues.includes('story_copy_too_long'), false)
})

test('refuse une narration impossible à afficher plutôt que de la tronquer', () => {
  const eventGraph = createEventGraph()
  const rawStory = createRawStory()
  rawStory.beats[0].narration = 'F'.repeat(521)

  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)
  const quality = evaluateRecapStory(story, snapshot, eventGraph)

  assert.equal(story.beats[0].narration.length, 521)
  assert.equal(quality.publishable, false)
  assert.ok(quality.issues.includes('story_copy_too_long'))
})

test('produit des slides ordonnées au format v4', () => {
  const eventGraph = createEventGraph()
  const story = normalizeRecapStory(createRawStory(), snapshot, eventGraph)
  const slides = buildRecapSlides(story, snapshot)

  assert.deepEqual(slides.map(slide => slide.order), [1, 2, 3, 4, 5, 6])
  assert.equal(slides[0].canvas.attrs.formatVersion, 4)
  assert.equal(slides[0].canvas.attrs.width, 390)
  assert.equal(slides[0].canvas.attrs.height, 844)
  assert.deepEqual(
    slides[0].canvas.children[0].children.slice(0, 4).map(node => node.className),
    ['Rect', 'Image', 'Rect', 'Group'],
  )
  assert.ok(slides[1].canvas.attrs.durationMs >= 5_500)
  assert.ok(slides[1].canvas.attrs.durationMs <= 22_000)
})

test('bloque les sources contractuelles en mode strict', () => {
  const tmdb = createRecapSourceProvider('tmdb', fetchedAt, 'https://www.themoviedb.org/tv/42')
  const audit = evaluateRecapSourceRights([tmdb], 'audit', [])
  const enforce = evaluateRecapSourceRights([tmdb], 'enforce', [])
  const approved = evaluateRecapSourceRights([tmdb], 'enforce', ['tmdb'])

  assert.equal(audit.ready, true)
  assert.equal(enforce.ready, false)
  assert.deepEqual(enforce.warnings, ['tmdb:contract-required'])
  assert.equal(approved.ready, true)
  assert.deepEqual(approved.approvedProviderIds, ['tmdb'])
})

test('détecte les prompts incompatibles avec le pipeline courant', () => {
  const compatible = '{{seasonQuickFacts}} {{eventGraph}} {{targetBeatCount}}'
  const incompatible = '{{seasonQuickFacts}} {{eventGraph}}'

  assert.equal(isRecapPromptCompatible(compatible), true)
  assert.equal(isRecapPromptCompatible(incompatible), false)
  assert.deepEqual(getMissingRecapPromptVariables(incompatible), ['{{targetBeatCount}}'])
})
