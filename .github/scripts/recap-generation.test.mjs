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
  applyRecoveredScenes,
  applySceneLinks,
  assembleSceneGraph,
  buildRecapSlides,
  createEpisodeExtractionPrompt,
  createRecapPrompt,
  createSceneCriticPrompt,
  createSceneLinkingPrompt,
  createSceneRecoveryPrompt,
  parseCriticGaps,
  describeInsufficientSources,
  evaluateRecapEventGraph,
  evaluateRecapSourceReadiness,
  evaluateRecapStory,
  finalizeRecapStory,
  getEpisodeExtractionTokenBudget,
  getEpisodeMomentTarget,
  getExtractableEpisodes,
  normalizeRecapEventGraph,
  normalizeRecapStory,
  splitDenseEpisodes,
} = await import('../../server/services/recap-generation.ts')
const { createStoryVerificationPrompt, listStoryTexts } = await import('../../server/services/recap-story-quality.ts')
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
const teaserQuote = 'suffisamment précis pour établir les faits importants'

function createEvidence(overrides) {
  return {
    providerId: 'trakt',
    kind: 'episode-synopsis',
    locale: 'en',
    sourceUrl: 'https://trakt.tv/episode',
    trustTier: 'reference',
    licenseId: 'trakt-api-terms',
    retrievedAt: fetchedAt,
    revisionId: null,
    ...overrides,
  }
}

function createPlot(number) {
  return `Résumé détaillé de l'épisode ${number}. ${'Le personnage principal prend une décision précise qui change la suite. '.repeat(7)}`.trim()
}

function createEpisode(number, evidence) {
  return {
    number,
    title: `Épisode ${number}`,
    overview: evidence.find(item => item.kind === 'episode-synopsis')?.text ?? null,
    image: `https://walter-r2.trakt.tv/episode-${number}.webp`,
    runtime: 45,
    rating: 8,
    traktId: 100 + number,
    evidence,
  }
}

function createSnapshot(createEpisodeEvidence) {
  return {
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
    episodes: Array.from({ length: 8 }, (_, index) => createEpisode(index + 1, createEpisodeEvidence(index + 1))),
  }
}

const snapshot = createSnapshot(number => [
  createEvidence({
    id: `trakt-e${number}-overview`,
    episodeNumber: number,
    text: `Synopsis source suffisamment précis pour établir les faits importants de l'épisode ${number}.`,
    sourceUrl: `https://trakt.tv/episode-${number}`,
  }),
  createEvidence({
    id: `wikipedia-en-e${number}-summary`,
    providerId: 'wikipedia',
    kind: 'episode-plot',
    episodeNumber: number,
    text: createPlot(number),
    sourceUrl: 'https://en.wikipedia.org/wiki/S%C3%A9rie_test_season_1',
    licenseId: 'cc-by-sa-4.0',
    revisionId: '123',
  }),
])

const teaserOnlySnapshot = createSnapshot(number => [
  createEvidence({
    id: `trakt-e${number}-overview`,
    episodeNumber: number,
    text: 'Une découverte sinistre laisse la police dans l’incompréhension.',
  }),
  createEvidence({
    id: `tmdb-e${number}-overview-fr`,
    providerId: 'tmdb',
    locale: 'fr',
    episodeNumber: number,
    text: 'Suite à une découverte sinistre, la police reste dans l’incompréhension.',
    licenseId: 'tmdb-commercial-agreement',
  }),
])

function createRawEventGraph(quoteText = teaserQuote) {
  return {
    events: Array.from({ length: 8 }, (_, index) => {
      const number = index + 1
      return {
        id: `event-${String(number).padStart(3, '0')}`,
        title: `Événement ${number}`,
        description: `Un fait vérifiable fait avancer l'intrigue pendant l'épisode ${number}.`,
        episodeNumber: number,
        location: number === 1 ? 'Winterfell' : null,
        detail: number === 1 ? 'Le personnage principal prend une décision précise.' : null,
        detailQuote: number === 1
          ? { evidenceId: 'wikipedia-en-e1-summary', text: 'prend une décision précise qui change la suite' }
          : null,
        quote: { evidenceId: `trakt-e${number}-overview`, text: quoteText },
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

function createScene(episodeNumber, title, quoteText = teaserQuote) {
  return {
    title,
    action: `${title} : une action précise rapportée par la source de l'épisode ${episodeNumber}.`,
    location: 'Port-Réal',
    detail: null,
    characters: ['Ned', 'Catelyn Stark'],
    importance: 'major',
    quote: { evidenceId: `trakt-e${episodeNumber}-overview`, text: quoteText },
    evidenceIds: [],
    contradictionEvidenceIds: [],
  }
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
    episodes: Array.from({ length: 8 }, (_, index) => createStoryEpisode(index + 1)),
  }
}

function createBeat(headline, episodeNumbers, imageEpisodeNumber) {
  return {
    headline,
    narration: `Personnage ${episodeNumbers[0]} fait avancer l'intrigue des épisodes ${episodeNumbers.join(' et ')}.`,
    tag: 'Moment clé',
    episodeNumbers,
    imageEpisodeNumber,
    eventIds: episodeNumbers.map(number => `event-${String(number).padStart(3, '0')}`),
  }
}

function createStoryEpisode(number) {
  return {
    episodeNumber: number,
    headline: `Le choix de Personnage ${number}`,
    moments: [{ text: `Personnage ${number} prend une décision précise.`, eventIds: [`event-${String(number).padStart(3, '0')}`] }],
  }
}

test('valide un graphe d’événements intégralement rattaché aux preuves', () => {
  const eventGraph = createEventGraph()
  const quality = evaluateRecapEventGraph(eventGraph, snapshot)

  assert.equal(quality.publishable, true)
  assert.equal(quality.referenceValidity, 1)
  assert.equal(quality.evidenceCoverage, 1)
  assert.equal(quality.episodeCoverage, 1)
  assert.equal(quality.documentedEpisodeCoverage, 1)
  assert.equal(quality.quoteVerification, 1)
  assert.deepEqual(quality.issues, [])
})

test('conserve le lieu, le détail marquant et la citation vérifiée d’une scène', () => {
  const [scene] = createEventGraph().events

  assert.equal(scene.location, 'Winterfell')
  assert.equal(scene.detail, 'Le personnage principal prend une décision précise.')
  assert.equal(scene.detailQuote.evidenceId, 'wikipedia-en-e1-summary')
  assert.deepEqual(scene.sourceQuote, { evidenceId: 'trakt-e1-overview', text: teaserQuote })
  assert.equal(scene.sceneIndex, 1)
})

test('vide un détail marquant sans citation retrouvée mais garde la scène', () => {
  const rawEventGraph = createRawEventGraph()
  rawEventGraph.events[0].detailQuote.text = 'Jaime le poignarde dans le dos devant le trône'
  rawEventGraph.events[1].detail = 'Un détail ajouté de mémoire.'

  const eventGraph = normalizeRecapEventGraph(rawEventGraph, snapshot)

  assert.equal(eventGraph.verification.verifiedScenes, 8)
  assert.deepEqual(eventGraph.events.slice(0, 2).map(event => [event.detail, event.detailQuote]), [[null, null], [null, null]])
  assert.deepEqual(
    eventGraph.verification.rejectedDetails.map(detail => [detail.episodeNumber, detail.reason]),
    [[1, 'quote_not_found'], [2, 'missing_quote']],
  )
  assert.equal(eventGraph.verification.verifiedDetails, 0)
  assert.equal(eventGraph.events[0].evidenceIds.includes('wikipedia-en-e1-summary'), false)
})

test('tolère la casse et la ponctuation d’une citation exacte', () => {
  const eventGraph = normalizeRecapEventGraph(createRawEventGraph('SUFFISAMMENT précis, pour « établir » les faits importants'), snapshot)

  assert.equal(eventGraph.verification.verifiedScenes, 8)
})

test('rejette les scènes dont la citation est absente, tronquée ou d’un autre épisode', () => {
  const rawEventGraph = createRawEventGraph()
  rawEventGraph.events[0].quote.text = 'suffisamment précis pour comprendre les faits importants'
  rawEventGraph.events[1].quote.evidenceId = 'trakt-e5-overview'
  rawEventGraph.events[2].quote.text = 'faits importants'
  rawEventGraph.events[3].quote.text = 'isamment précis pour établir les faits'
  delete rawEventGraph.events[4].quote

  const eventGraph = normalizeRecapEventGraph(rawEventGraph, snapshot)
  const quality = evaluateRecapEventGraph(eventGraph, snapshot)

  assert.deepEqual(
    eventGraph.verification.rejectedScenes.map(scene => [scene.episodeNumber, scene.reason]),
    [[1, 'quote_not_found'], [2, 'foreign_evidence'], [3, 'quote_too_short'], [4, 'quote_not_found'], [5, 'missing_quote']],
  )
  assert.equal(eventGraph.verification.verifiedScenes, 3)
  assert.equal(quality.publishable, false)
  assert.ok(quality.issues.includes('unverified_scene_quotes'))
})

test('rattache chaque événement à un seul épisode', () => {
  const rawEventGraph = createRawEventGraph()
  delete rawEventGraph.events[0].episodeNumber
  rawEventGraph.events[0].episodeNumbers = [1, 2]

  const eventGraph = normalizeRecapEventGraph(rawEventGraph, snapshot)

  assert.equal(eventGraph.events.some(event => event.id === 'event-001'), false)
  assert.ok(eventGraph.events.every(event => event.episodeNumbers.length === 1))
  assert.deepEqual(eventGraph.events[0].episodeNumbers, [2])
})

test('assemble les scènes de chaque épisode dans l’ordre en signalant les échecs', () => {
  const outputs = new Map([
    [3, JSON.stringify({ scenes: [createScene(3, 'Ned arrive au Conseil')] })],
    [1, JSON.stringify({ scenes: [createScene(1, 'Les loups sont trouvés'), createScene(1, 'Bran tombe de la tour')] })],
    [2, null],
    [4, '{"scenes": ['],
  ])

  const eventGraph = assembleSceneGraph(snapshot, outputs)

  assert.deepEqual(eventGraph.events.map(event => event.id), ['event-e01-s01', 'event-e01-s02', 'event-e03-s01'])
  assert.deepEqual(eventGraph.events.map(event => event.sceneIndex), [1, 2, 1])
  assert.match(eventGraph.events[1].description, /^Bran tombe de la tour : une action précise/)
  assert.equal(eventGraph.events[0].location, 'Port-Réal')
  assert.deepEqual(eventGraph.verification.failedEpisodes, [2, 4])
  assert.equal(eventGraph.linking, 'pending')
})

test('relie les scènes sans ajouter de fait ni de lien vers le futur', () => {
  const eventGraph = assembleSceneGraph(snapshot, new Map([
    [1, JSON.stringify({ scenes: [createScene(1, 'Les loups sont trouvés')] })],
    [2, JSON.stringify({ scenes: [createScene(2, 'Ned part pour Port-Réal')] })],
    [3, JSON.stringify({ scenes: [createScene(3, 'Ned arrive au Conseil')] })],
  ]))
  const linkingPrompt = createSceneLinkingPrompt(snapshot, eventGraph)
  const linked = applySceneLinks(eventGraph, JSON.stringify({
    characters: [{ name: 'Eddard Stark', aliases: ['Ned', 'Lord Stark'] }],
    scenes: [
      { id: 'event-e01-s01', arc: 'Les Stark', causedByEventIds: ['event-e03-s01'], consequenceEventIds: ['event-e02-s01'] },
      { id: 'event-e02-s01', arc: 'Route royale', causedByEventIds: ['event-e01-s01', 'event-999'], consequenceEventIds: [] },
    ],
  }))

  assert.match(linkingPrompt, /\[event-e02-s01\] Épisode 2 · Ned part pour Port-Réal/)
  assert.doesNotMatch(linkingPrompt, new RegExp(teaserQuote))
  assert.equal(linked.linking, 'linked')
  assert.deepEqual(linked.events[0].characters, ['Eddard Stark', 'Catelyn Stark'])
  assert.equal(linked.events[0].arc, 'Les Stark')
  assert.deepEqual(linked.events[0].causedByEventIds, [])
  assert.deepEqual(linked.events[0].consequenceEventIds, ['event-e02-s01'])
  assert.deepEqual(linked.events[1].causedByEventIds, ['event-e01-s01'])
  assert.equal(linked.events[2].description, eventGraph.events[2].description)
})

test('limite les suggestions du critique aux épisodes connus', () => {
  const gaps = parseCriticGaps(JSON.stringify({
    gaps: [
      { episodeNumber: 1, moment: 'Ned tue Lady.' },
      { episodeNumber: 1, moment: 'Moment 2.' },
      { episodeNumber: 1, moment: 'Moment 3.' },
      { episodeNumber: 1, moment: 'Moment 4 en trop.' },
      { episodeNumber: 42, moment: 'Épisode inconnu.' },
      { episodeNumber: 2, moment: '   ' },
    ],
  }), snapshot)

  assert.deepEqual(gaps.map(gap => gap.moment), ['Ned tue Lady.', 'Moment 2.', 'Moment 3.'])
})

test('ajoute seulement les moments du critique que les sources citent mot pour mot', () => {
  const extracted = assembleSceneGraph(snapshot, new Map([
    [1, JSON.stringify({ scenes: [createScene(1, 'Les loups sont trouvés'), createScene(1, 'Bran tombe de la tour')] })],
    [2, JSON.stringify({ scenes: [createScene(2, 'Ned part pour Port-Réal')] })],
  ]))
  const gaps = [
    { episodeNumber: 1, moment: 'Le déserteur est exécuté.' },
    { episodeNumber: 1, moment: 'Un mariage dothraki.' },
    { episodeNumber: 2, moment: 'Lady est exécutée.' },
  ]
  const pendingGraph = { ...extracted, critic: { status: 'pending', gaps, recoveredScenes: 0, unsupportedGaps: [] } }
  const criticPrompt = createSceneCriticPrompt(snapshot, extracted)
  const recoveryPrompt = createSceneRecoveryPrompt(snapshot, snapshot.episodes[0], pendingGraph, gaps.slice(0, 2))
  const recovered = { ...createScene(1, 'Le déserteur est exécuté'), gapNumber: 1, afterSceneIndex: 0 }
  const invented = { ...createScene(1, 'Un mariage dothraki', 'Daenerys épouse Khal Drogo devant les Dothrakis'), gapNumber: 2, afterSceneIndex: 2 }
  const unrequested = { ...createScene(1, 'Une scène non demandée'), gapNumber: 9, afterSceneIndex: 1 }

  const eventGraph = applyRecoveredScenes(snapshot, pendingGraph, new Map([
    [1, JSON.stringify({ scenes: [recovered, invented, unrequested] })],
    [2, null],
  ]))

  assert.match(criticPrompt, /## Épisode 1 · Épisode 1\n- Les loups sont trouvés/)
  assert.doesNotMatch(criticPrompt, new RegExp(teaserQuote))
  assert.match(recoveryPrompt, /# MOMENTS SIGNALÉS\n1\. Le déserteur est exécuté\.\n2\. Un mariage dothraki\./)
  assert.match(recoveryPrompt, /# SCÈNES DÉJÀ EXTRAITES\n1\. Les loups sont trouvés\n2\. Bran tombe de la tour/)
  assert.deepEqual(
    eventGraph.events.map(event => [event.id, event.sceneIndex]),
    [['event-e01-r01', 1], ['event-e01-s01', 2], ['event-e01-s02', 3], ['event-e02-s01', 1]],
  )
  assert.equal(eventGraph.critic.status, 'completed')
  assert.equal(eventGraph.critic.recoveredScenes, 1)
  assert.deepEqual(eventGraph.critic.unsupportedGaps.map(gap => gap.moment), ['Un mariage dothraki.', 'Lady est exécutée.'])
  assert.equal(eventGraph.verification.proposedScenes, extracted.verification.proposedScenes + 2)
  assert.equal(eventGraph.verification.verifiedScenes, extracted.verification.verifiedScenes + 1)
  assert.equal(eventGraph.verification.rejectedScenes.at(-1).reason, 'quote_not_found')
})

test('signale un épisode documenté absent de la chronologie', () => {
  const rawEventGraph = createRawEventGraph()
  rawEventGraph.events = rawEventGraph.events.filter(event => event.episodeNumber <= 6)
  rawEventGraph.events[5].consequenceEventIds = []

  const eventGraph = normalizeRecapEventGraph(rawEventGraph, snapshot)
  const quality = evaluateRecapEventGraph(eventGraph, snapshot)

  assert.equal(quality.documentedEpisodeCoverage, 0.75)
  assert.equal(quality.publishable, false)
  assert.ok(quality.issues.includes('low_event_episode_coverage'))
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

test('accepte une saison dont les épisodes ont un vrai résumé', () => {
  const readiness = evaluateRecapSourceReadiness(snapshot)

  assert.equal(readiness.ready, true)
  assert.equal(readiness.documentedEpisodes, 8)
  assert.deepEqual(readiness.issues, [])
})

test('bloque une saison décrite seulement par des accroches, même traduites', () => {
  const readiness = evaluateRecapSourceReadiness(teaserOnlySnapshot)

  assert.equal(readiness.ready, false)
  assert.equal(readiness.documentedEpisodes, 0)
  assert.ok(readiness.richness < 0.1)
  assert.deepEqual(readiness.issues, ['insufficient_episode_sources'])
  assert.match(describeInsufficientSources(readiness), /aucun épisode n’est décrit précisément/)
})

test('refuse de publier un récit construit sur des accroches', () => {
  const rawEventGraph = createRawEventGraph('laisse la police dans l’incompréhension')
  const eventGraph = normalizeRecapEventGraph(rawEventGraph, teaserOnlySnapshot)
  const story = normalizeRecapStory(createRawStory(), teaserOnlySnapshot, eventGraph)
  const quality = evaluateRecapStory(story, teaserOnlySnapshot, eventGraph)

  assert.equal(quality.publishable, false)
  assert.ok(quality.issues.includes('thin_source_material'))
})

test('donne au modèle les seules sources de l’épisode extrait', () => {
  const eventGraph = createEventGraph()
  const extractionPrompt = createEpisodeExtractionPrompt(snapshot, snapshot.episodes[0])
  const storyPrompt = createRecapPrompt(snapshot, eventGraph)

  assert.match(extractionPrompt, /\[trakt-e1-overview\]/)
  assert.match(extractionPrompt, /trakt\/en\/reference\/trakt-api-terms/)
  assert.doesNotMatch(extractionPrompt, /\[trakt-e2-overview\]/)
  assert.match(storyPrompt, /\[event-001\]/)
  assert.match(storyPrompt, /Lieu : Winterfell/)
  assert.match(storyPrompt, /Détail marquant : Le personnage principal prend une décision précise\./)
  assert.doesNotMatch(storyPrompt, /Synopsis source suffisamment précis/)
})

test('fixe un objectif de scènes par épisode selon la richesse des sources', () => {
  const extractionPrompt = createEpisodeExtractionPrompt(snapshot, snapshot.episodes[0])
  const teaserPrompt = createEpisodeExtractionPrompt(teaserOnlySnapshot, teaserOnlySnapshot.episodes[0])
  const withoutSources = { ...snapshot, episodes: [...snapshot.episodes, createEpisode(9, [])] }

  assert.match(extractionPrompt, /Extrais 2 scènes, dans l'ordre/)
  assert.ok(extractionPrompt.indexOf('[wikipedia-en-e1-summary]') < extractionPrompt.indexOf('[trakt-e1-overview]'))
  assert.match(teaserPrompt, /Extrais au plus 1 scène, dans l'ordre/)
  assert.ok(getEpisodeExtractionTokenBudget(snapshot.episodes[0]) > getEpisodeExtractionTokenBudget(teaserOnlySnapshot.episodes[0]))
  assert.deepEqual(getExtractableEpisodes(withoutSources).map(episode => episode.number), [1, 2, 3, 4, 5, 6, 7, 8])
})

test('bloque les références de preuve invalides', () => {
  const rawEventGraph = createRawEventGraph()
  rawEventGraph.events[0].evidenceIds = ['preuve-inconnue']

  const eventGraph = normalizeRecapEventGraph(rawEventGraph, snapshot)
  const quality = evaluateRecapEventGraph(eventGraph, snapshot)

  assert.equal(quality.publishable, false)
  assert.ok(quality.referenceValidity < 1)
  assert.ok(quality.issues.includes('invalid_event_references'))
})

test('écarte les liens causaux inconnus ou révélés dans un épisode ultérieur', () => {
  const rawEventGraph = createRawEventGraph()
  rawEventGraph.events[1].causedByEventIds = ['event-999', 'event-001']
  // A time-travel cause shown in episode 8 explains what happens in episode 1.
  rawEventGraph.events[0].causedByEventIds = ['event-008']
  rawEventGraph.events[7].consequenceEventIds = ['event-001']

  const eventGraph = normalizeRecapEventGraph(rawEventGraph, snapshot)
  const quality = evaluateRecapEventGraph(eventGraph, snapshot)

  assert.deepEqual(eventGraph.events[1].causedByEventIds, ['event-001'])
  assert.deepEqual(eventGraph.events[0].causedByEventIds, [])
  assert.deepEqual(eventGraph.events[7].consequenceEventIds, [])
  assert.equal(quality.causalIntegrity, 1)
  assert.equal(quality.publishable, true)
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

  assert.deepEqual(story.beats[0].evidenceIds, ['trakt-e1-overview', 'wikipedia-en-e1-summary', 'trakt-e2-overview'])
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

test('refuse un récit sans la partie épisode par épisode', () => {
  const eventGraph = createEventGraph()
  const rawStory = createRawStory()
  rawStory.episodes = rawStory.episodes.slice(0, 5)

  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)
  const quality = evaluateRecapStory(story, snapshot, eventGraph)

  assert.equal(quality.episodeRecapCoverage, 0.63)
  assert.ok(quality.issues.includes('missing_episode_recaps'))
})

test('exige que chaque scène décisive soit racontée dans son épisode', () => {
  const eventGraph = createEventGraph()
  const rawStory = createRawStory()
  rawStory.episodes[5].moments = [{ text: 'Personnage 6 hésite longuement.', eventIds: [] }]

  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)
  const quality = evaluateRecapStory(story, snapshot, eventGraph)

  assert.equal(quality.criticalEpisodeCoverage, 0.5)
  assert.ok(quality.issues.includes('critical_scenes_missing_from_episodes'))
})

test('refuse un moment qui cite une scène d’un autre épisode', () => {
  const eventGraph = createEventGraph()
  const rawStory = createRawStory()
  rawStory.episodes[0].moments[0].eventIds = ['event-002']

  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)
  const quality = evaluateRecapStory(story, snapshot, eventGraph)

  assert.ok(quality.referenceValidity < 1)
  assert.ok(quality.issues.includes('invalid_story_references'))
})

test('refuse les formules creuses et les textes qui ne nomment personne', () => {
  const eventGraph = createEventGraph()
  const rawStory = createRawStory()
  rawStory.beats[0].narration = 'Tout bascule et les tensions montent dans la ville.'
  rawStory.beats.slice(1).forEach((beat) => { beat.narration = 'Une suite d’événements importants se produit.' })

  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)
  const quality = evaluateRecapStory(story, snapshot, eventGraph)

  assert.deepEqual(quality.vaguePhrases, [
    { key: 'beat-1-narration', phrase: 'tout bascule' },
    { key: 'beat-1-narration', phrase: 'les tensions montent' },
  ])
  assert.equal(quality.characterMentionRatio, 0.62)
  assert.ok(quality.issues.includes('vague_story_copy'))
  assert.ok(quality.issues.includes('unspecific_story_copy'))
})

test('applique les corrections de la vérification des affirmations', () => {
  const eventGraph = createEventGraph()
  const draft = normalizeRecapStory(createRawStory(), snapshot, eventGraph)
  const verificationPrompt = createStoryVerificationPrompt(draft, eventGraph)
  const { story, quality, slides } = finalizeRecapStory(draft, JSON.stringify({
    corrections: [
      { key: 'beat-1-narration', unsupportedClaims: ['un duel'], correctedText: 'Personnage 1 fait un choix décisif.' },
      { key: 'episode-2-moment-1', unsupportedClaims: ['une trahison'], correctedText: '' },
      { key: 'beat-9-narration', unsupportedClaims: ['clé inconnue'], correctedText: 'Ignoré.' },
    ],
  }), snapshot, eventGraph)

  assert.match(verificationPrompt, /<<episode-3-moment-1>> scènes citées : event-003/)
  assert.doesNotMatch(verificationPrompt, new RegExp(teaserQuote))
  assert.equal(story.beats[0].narration, 'Personnage 1 fait un choix décisif.')
  assert.equal(draft.beats[0].narration.startsWith('Personnage 1 fait avancer'), true)
  assert.deepEqual(story.episodes.map(episode => episode.episodeNumber), [1, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(quality.claimVerification, {
    checkedTexts: 1 + 5 * 2 + 8 * 2,
    correctedTexts: 1,
    removedMoments: 1,
    unresolvedTexts: 0,
    corrections: [
      { key: 'beat-1-narration', unsupportedClaims: ['un duel'] },
      { key: 'episode-2-moment-1', unsupportedClaims: ['une trahison'] },
    ],
  })
  assert.ok(quality.issues.includes('missing_episode_recaps'))
  assert.equal(slides.length, 1 + 5 + 7)
})

test('bloque un récit dont une affirmation reste non soutenue', () => {
  const eventGraph = createEventGraph()
  const draft = normalizeRecapStory(createRawStory(), snapshot, eventGraph)
  const { quality } = finalizeRecapStory(draft, JSON.stringify({
    corrections: [{ key: 'beat-2-narration', unsupportedClaims: ['une mort'], correctedText: '' }],
  }), snapshot, eventGraph)

  assert.equal(quality.claimVerification.unresolvedTexts, 1)
  assert.equal(quality.publishable, false)
  assert.ok(quality.issues.includes('unsupported_story_claims'))
})

test('fixe un objectif de moments par épisode selon ses scènes importantes', () => {
  const rawEventGraph = createRawEventGraph()
  rawEventGraph.events.push(...Array.from({ length: 7 }, (_, index) => ({
    ...rawEventGraph.events[0],
    id: `event-1${index}`,
    importance: 'major',
    causedByEventIds: [],
    consequenceEventIds: [],
  })))
  const eventGraph = normalizeRecapEventGraph(rawEventGraph, snapshot)
  const prompt = createRecapPrompt(snapshot, eventGraph)

  assert.equal(getEpisodeMomentTarget(eventGraph, 1), 8)
  assert.equal(getEpisodeMomentTarget(eventGraph, 2), 3)
  assert.match(prompt, /- Épisode 1 : 8 moments \(répartis automatiquement sur deux slides\)\n- Épisode 2 : 3 moments\n/)
})

test('répartit un épisode chargé sur deux slides après la vérification', () => {
  const eventGraph = createEventGraph()
  const rawStory = createRawStory()
  rawStory.episodes[0].moments = Array.from({ length: 7 }, (_, index) => ({
    text: `Personnage 1 vit le moment ${index + 1}.`,
    eventIds: ['event-001'],
  }))
  const draft = normalizeRecapStory(rawStory, snapshot, eventGraph)
  const { story, quality, slides } = finalizeRecapStory(draft, JSON.stringify({
    corrections: [{ key: 'episode-1-moment-6', unsupportedClaims: ['un détail'], correctedText: 'Personnage 1 vit le moment corrigé.' }],
  }), snapshot, eventGraph)
  const keys = listStoryTexts(story).map(text => text.key)

  assert.deepEqual(
    story.episodes.slice(0, 3).map(episode => [episode.episodeNumber, episode.part, episode.partCount, episode.moments.length]),
    [[1, 1, 2, 4], [1, 2, 2, 3], [2, undefined, undefined, 1]],
  )
  assert.equal(story.episodes[1].moments[1].text, 'Personnage 1 vit le moment corrigé.')
  assert.equal(new Set(keys).size, keys.length)
  assert.ok(keys.includes('episode-1-moment-7'))
  assert.equal(slides.length, 1 + 5 + 9)
  assert.ok(slides[6].canvas.children[0].children.some(node => node.children?.some(child => child.attrs?.text === 'Épisode 1 · 1/2')))
  assert.equal(quality.issues.includes('story_copy_too_long'), false)
  assert.equal(quality.importantEpisodeCoverage, 1)
  assert.deepEqual(splitDenseEpisodes(draft).episodes.length, 9)
})

test('produit des slides ordonnées au format v9', () => {
  const eventGraph = createEventGraph()
  const story = normalizeRecapStory(createRawStory(), snapshot, eventGraph)
  const slides = buildRecapSlides(story, snapshot)

  assert.deepEqual(slides.map(slide => slide.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
  assert.ok(slides[6].canvas.children[0].children.some(node => node.attrs?.id === 'group-slide-7-moments'))
  assert.equal(slides[0].canvas.attrs.formatVersion, 9)
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
