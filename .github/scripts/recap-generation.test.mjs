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
  createEpisodeExtractionPrompt,
  createRecapPrompt,
  createSceneCriticPrompt,
  createSceneLinkingPrompt,
  createSceneRecoveryPrompt,
  getEpisodeMomentTarget,
} = await import('../../server/services/recap-generation/prompts.ts')
const {
  applyRecoveredScenes,
  applySceneLinks,
  assembleSceneGraph,
  evaluateRecapEventGraph,
  normalizeRecapEventGraph,
  parseCriticGaps,
} = await import('../../server/services/recap-generation/scene-graph.ts')
const {
  buildRecapSlides,
  planStorySlides,
} = await import('../../server/services/recap-generation/slides.ts')
const {
  describeInsufficientSources,
  evaluateRecapSourceReadiness,
  getEpisodeExtractionTokenBudget,
  getExtractableEpisodes,
} = await import('../../server/services/recap-generation/sources.ts')
const {
  evaluateRecapStory,
  finalizeRecapStory,
  normalizeRecapStory,
} = await import('../../server/services/recap-generation/story.ts')
const { createStoryVerificationPrompt, listStoryTexts } = await import('../../server/services/recap-story-quality.ts')
const {
  createRecapSourceProvider,
  evaluateRecapSourceRights,
} = await import('../../server/services/recap-source-registry.ts')
const {
  getMissingRecapPromptVariables,
  isRecapPromptCompatible,
} = await import('../../lib/prompts/defaultPrompt.ts')
const recapLocales = await import('../../lib/recap-locales.ts')

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

const eventId = number => `event-${String(number).padStart(3, '0')}`

function createRawStory() {
  return {
    cover: {
      title: 'Série test',
      subtitle: 'Saison 1',
      logline: 'Les décisions qui changent toute la saison.',
    },
    episodes: Array.from({ length: 8 }, (_, index) => createStoryEpisode(index + 1)),
    ending: {
      characters: [1, 4, 8].map(number => ({
        character: `Personnage ${number}`,
        text: `Personnage ${number} garde la place prise à l'épisode ${number}.`,
        eventIds: [eventId(number)],
      })),
      questions: [{ character: '', text: 'Que deviendra la décision de Personnage 8 ?', eventIds: [eventId(8)] }],
    },
  }
}

function createStoryEpisode(number) {
  return {
    episodeNumber: number,
    headline: `Le choix de Personnage ${number}`,
    moments: [{ text: `Personnage ${number} prend une décision précise.`, eventIds: [eventId(number)] }],
    changes: {
      deaths: number === 6
        ? [{ character: 'Personnage 6', text: 'Personnage 6 meurt pendant l’épisode 6.', eventIds: [eventId(6)] }]
        : [],
      situations: [{ character: `Personnage ${number}`, text: `Personnage ${number} change de situation.`, eventIds: [eventId(number)] }],
      questions: [],
    },
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
  assert.deepEqual(readiness.issues, ['insufficient_episode_sources', 'insufficient_finale_source'])
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
  rawStory.episodes[1].moments[0].eventIds = ['event-999']

  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)
  const quality = evaluateRecapStory(story, snapshot, eventGraph)

  assert.equal(quality.publishable, false)
  assert.ok(quality.referenceValidity < 1)
  assert.ok(quality.evidenceCoverage < 1)
  assert.ok(quality.issues.includes('invalid_story_references'))
  assert.ok(quality.issues.includes('uncited_story_texts'))
})

test('n’accepte dans un bilan que des scènes de son épisode', () => {
  const eventGraph = createEventGraph()
  const rawStory = createRawStory()
  rawStory.episodes[0].changes.situations[0].eventIds = ['event-002']
  rawStory.ending.characters[0].eventIds = ['event-007']

  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)
  const quality = evaluateRecapStory(story, snapshot, eventGraph)

  // The bilan line of episode 1 cannot cite episode 2; the season end may cite any episode.
  assert.equal(quality.referenceValidity, 0.95)
  assert.ok(quality.issues.includes('invalid_story_references'))
})

test('le serveur dérive les preuves depuis les événements cités', () => {
  const eventGraph = createEventGraph()
  const story = normalizeRecapStory(createRawStory(), snapshot, eventGraph)

  assert.deepEqual(story.episodes[0].evidenceIds, ['trakt-e1-overview', 'wikipedia-en-e1-summary'])
  assert.equal(story.layout, 'chapters')
  assert.deepEqual(story.beats, [])
})

test('retire le numéro d’épisode répété en tête du titre de chapitre', () => {
  const eventGraph = createEventGraph()
  const rawStory = createRawStory()
  rawStory.episodes[0].headline = 'Épisode 1 — Le choix de Personnage 1'
  rawStory.episodes[1].headline = 'Un épisode 2 sans préfixe'

  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)

  assert.equal(story.episodes[0].headline, 'Le choix de Personnage 1')
  assert.equal(story.episodes[1].headline, 'Un épisode 2 sans préfixe')
})

test('conserve intégralement un moment long au lieu d’ajouter une ellipse', () => {
  const eventGraph = createEventGraph()
  const rawStory = createRawStory()
  const longMoment = `Personnage 1 ${'agit précisément. '.repeat(11)}Fin complète.`
  rawStory.episodes[0].moments[0].text = longMoment

  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)
  const quality = evaluateRecapStory(story, snapshot, eventGraph)

  assert.equal(story.episodes[0].moments[0].text, longMoment.trim())
  assert.equal(story.episodes[0].moments[0].text.endsWith('…'), false)
  assert.equal(quality.issues.includes('story_copy_too_long'), false)
})

test('refuse une ligne de bilan impossible à afficher plutôt que de la tronquer', () => {
  const eventGraph = createEventGraph()
  const rawStory = createRawStory()
  rawStory.episodes[0].changes.situations[0].text = 'F'.repeat(201)

  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)
  const quality = evaluateRecapStory(story, snapshot, eventGraph)

  assert.equal(story.episodes[0].changes.situations[0].text.length, 201)
  assert.equal(quality.publishable, false)
  assert.ok(quality.issues.includes('story_copy_too_long'))
})

test('ne répète pas une mort dans les situations du même épisode', () => {
  const eventGraph = createEventGraph()
  const rawStory = createRawStory()
  rawStory.episodes[5].changes.situations.push({ character: 'Autre personnage', text: 'Autre personnage part.', eventIds: [eventId(6)] })

  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)

  assert.deepEqual(story.episodes[5].changes.situations.map(line => line.character), ['Autre personnage'])
})

test('vérifie une question ouverte contre tout son épisode, ou toute la saison', () => {
  const eventGraph = createEventGraph()
  const rawStory = createRawStory()
  rawStory.episodes[0].moments.push({ text: 'Personnage 1 tranche la question.', eventIds: ['event-001'] })
  rawStory.episodes[0].changes.questions = [{ character: '', text: 'Personnage 1 survivra-t-il ?', eventIds: [] }]
  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)
  const texts = new Map(listStoryTexts(story).map(text => [text.key, text.eventIds]))

  assert.deepEqual(texts.get('episode-1-question-1'), ['event-001'])
  assert.deepEqual(texts.get('ending-question-1'), [])
  assert.deepEqual(texts.get('ending-character-1'), ['event-001'])
})

test('exige une fin de saison qui dit où en sont les personnages', () => {
  const eventGraph = createEventGraph()
  const rawStory = createRawStory()
  rawStory.ending.characters = rawStory.ending.characters.slice(0, 2)

  const quality = evaluateRecapStory(normalizeRecapStory(rawStory, snapshot, eventGraph), snapshot, eventGraph)

  assert.equal(quality.publishable, false)
  assert.ok(quality.issues.includes('missing_season_ending'))
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
  rawStory.episodes[0].moments[0].text = 'Tout bascule et les tensions montent dans la ville.'
  rawStory.episodes.slice(1, 4).forEach((episode) => { episode.moments[0].text = 'Une suite d’événements importants se produit.' })

  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)
  const quality = evaluateRecapStory(story, snapshot, eventGraph)

  assert.deepEqual(quality.vaguePhrases, [
    { key: 'episode-1-moment-1', phrase: 'tout bascule' },
    { key: 'episode-1-moment-1', phrase: 'les tensions montent' },
  ])
  assert.equal(quality.characterMentionRatio, 0.5)
  assert.ok(quality.issues.includes('vague_story_copy'))
  assert.ok(quality.issues.includes('unspecific_story_copy'))
})

test('vérifie aussi les bilans et la fin de saison', () => {
  const eventGraph = createEventGraph()
  const draft = normalizeRecapStory(createRawStory(), snapshot, eventGraph)
  const verificationPrompt = createStoryVerificationPrompt(draft, eventGraph)
  const { story, quality, slides } = finalizeRecapStory(draft, JSON.stringify({
    corrections: [
      { key: 'episode-1-situation-1', unsupportedClaims: ['un duel'], correctedText: 'Personnage 1 change de camp.' },
      { key: 'episode-2-moment-1', unsupportedClaims: ['une trahison'], correctedText: '' },
      { key: 'ending-question-1', unsupportedClaims: ['une réponse suggérée'], correctedText: '' },
      { key: 'episode-9-death-1', unsupportedClaims: ['clé inconnue'], correctedText: 'Ignoré.' },
    ],
  }), snapshot, eventGraph)

  assert.match(verificationPrompt, /<<episode-3-moment-1>> scènes citées : event-003/)
  assert.match(verificationPrompt, /<<episode-6-death-1>> scènes citées : event-006/)
  assert.match(verificationPrompt, /<<ending-character-1>> scènes citées : event-001/)
  assert.match(verificationPrompt, /<<ending-question-1>> scènes citées : toutes les scènes/)
  assert.doesNotMatch(verificationPrompt, new RegExp(teaserQuote))
  assert.equal(story.episodes[0].changes.situations[0].text, 'Personnage 1 change de camp.')
  assert.equal(draft.episodes[0].changes.situations[0].text, 'Personnage 1 change de situation.')
  assert.deepEqual(story.episodes.map(episode => episode.episodeNumber), [1, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(story.ending.questions, [])
  assert.deepEqual(quality.claimVerification, {
    // Episode 6 tells its death only: its situation line about the same character is dropped.
    checkedTexts: 1 + 8 * 2 + 7 + 1 + 3 + 1,
    correctedTexts: 1,
    removedMoments: 1,
    removedLines: 1,
    unresolvedTexts: 0,
    corrections: [
      { key: 'episode-1-situation-1', unsupportedClaims: ['un duel'] },
      { key: 'episode-2-moment-1', unsupportedClaims: ['une trahison'] },
      { key: 'ending-question-1', unsupportedClaims: ['une réponse suggérée'] },
    ],
  })
  assert.ok(quality.issues.includes('missing_episode_recaps'))
  // Cover, then a card, a moment slide and a bilan per episode, then "Où en est-on" and the deaths.
  assert.equal(slides.length, 1 + 7 * 3 + 2)
})

test('bloque un récit dont une affirmation reste non soutenue', () => {
  const eventGraph = createEventGraph()
  const draft = normalizeRecapStory(createRawStory(), snapshot, eventGraph)
  const { quality } = finalizeRecapStory(draft, JSON.stringify({
    corrections: [{ key: 'episode-2-headline', unsupportedClaims: ['une mort'], correctedText: '' }],
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
  assert.match(prompt, /- Épisode 1 : 8 moments\n- Épisode 2 : 3 moments\n/)
  assert.doesNotMatch(prompt, /beats|L'essentiel/)
})

test('découpe chaque épisode en chapitre : carton, moments, bilan', () => {
  const rawEventGraph = createRawEventGraph()
  rawEventGraph.events.push(...[1, 2, 3, 4].map(index => ({
    ...rawEventGraph.events[2],
    id: `event-03${index}`,
    title: `Scène secondaire ${index}`,
    importance: 'major',
    location: index % 2 ? 'Le Mur' : 'Port-Réal',
    characters: [`Second rôle ${index}`],
    causedByEventIds: [],
    consequenceEventIds: [],
  })))
  const eventGraph = normalizeRecapEventGraph(rawEventGraph, snapshot)
  const rawStory = createRawStory()
  rawStory.episodes[2].moments = ['event-031', 'event-003', 'event-032', 'event-033', 'event-034']
    .map(id => ({ text: `Un moment précis cite ${id}.`, eventIds: [id] }))
  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)
  const plan = planStorySlides(story, eventGraph, snapshot)
  const chapter = plan.filter(slide => slide.content.episodeNumber === 3)

  assert.deepEqual(chapter.map(slide => slide.content.kind), ['chapter', 'moment-group', 'moment', 'moment-group', 'moment-group', 'changes'])
  assert.deepEqual(chapter[0].content, {
    kind: 'chapter',
    episodeNumber: 3,
    episodeTitle: 'Épisode 3',
    headline: 'Le choix de Personnage 3',
    locations: ['Le Mur', 'Port-Réal'],
    decisiveCount: 1,
    otherCount: 4,
  })
  assert.equal(chapter[1].content.heading, 'Au début de l’épisode')
  // Other moments go two by two, so their text stays large.
  assert.equal(chapter[3].content.heading, 'Pendant ce temps')
  assert.equal(chapter[3].content.items.length, 2)
  assert.deepEqual(chapter[3].content.items[0].characters, [{ name: 'Second rôle 2', initials: 'SE', imageUrl: null }])
  assert.deepEqual(chapter[3].eventIds, ['event-032', 'event-033'])
  assert.equal(chapter[4].content.heading, 'Ensuite')
  assert.equal(chapter[2].content.text, 'Un moment précis cite event-003.')
  assert.deepEqual(chapter[5].content.nextEpisode, { number: 4, title: 'Épisode 4' })
  assert.deepEqual(plan.slice(-3).map(slide => slide.content.kind), ['ending-status', 'ending-deaths', 'ending-questions'])
  assert.deepEqual(plan.at(-2).content.deaths, [{ character: { name: 'Personnage 6', initials: 'PE', imageUrl: null }, episodeNumber: 6 }])
  assert.deepEqual(plan.at(-2).eventIds, ['event-006'])
  assert.deepEqual(plan.at(-1).content.questions, [{ text: 'Que deviendra la décision de Personnage 8 ?', episodeNumbers: [8] }])
})

test('écrit un recap anglais de l’extraction des scènes jusqu’aux slides', () => {
  const eventGraph = normalizeRecapEventGraph(createRawEventGraph(), snapshot, 'en')
  const episode = getExtractableEpisodes(snapshot)[0]
  const story = normalizeRecapStory(createRawStory(), snapshot, eventGraph)
  const plan = planStorySlides(story, eventGraph, snapshot)

  assert.equal(eventGraph.locale, 'en')
  assert.equal(story.locale, 'en')
  assert.match(createEpisodeExtractionPrompt(snapshot, episode, 'en'), /400 caractères, en anglais\./)
  assert.match(createSceneLinkingPrompt(snapshot, eventGraph, 'en'), /2 à 5 mots en anglais\./)
  assert.match(createRecapPrompt(snapshot, eventGraph, undefined, 'en'), /Écris intégralement en anglais/)
  assert.match(createStoryVerificationPrompt(story, eventGraph, 'en'), /réécrit le texte en anglais/)
  assert.equal(plan.find(slide => slide.content.kind === 'moment-group')?.content.heading, 'At the start of the episode')
  // The French default stays unchanged for older jobs.
  assert.match(createRecapPrompt(snapshot, eventGraph), /Écris intégralement en français/)
})

test('impose la langue du recap à un prompt personnalisé', () => {
  const eventGraph = normalizeRecapEventGraph(createRawEventGraph(), snapshot, 'en')
  const prompt = createRecapPrompt(snapshot, eventGraph, 'Écris en français. {{seasonQuickFacts}} {{eventGraph}} {{episodeMomentTargets}}', 'en')

  assert.match(prompt, /# LANGUE\nÉcris tous les textes en anglais/)
})

test('répartit un bilan chargé et la fin de saison sur plusieurs slides', () => {
  const eventGraph = createEventGraph()
  const rawStory = createRawStory()
  rawStory.episodes[0].changes.deaths = [7, 8].map(number => ({
    character: `Personnage ${number}`,
    text: `Personnage ${number} meurt.`,
    eventIds: [eventId(1)],
  }))
  rawStory.episodes[0].changes.situations = Array.from({ length: 5 }, (_, index) => ({
    character: `Personnage ${index + 1}`,
    text: `Personnage ${index + 1} change de situation.`,
    eventIds: [eventId(1)],
  }))
  rawStory.episodes[0].changes.questions = [{ character: '', text: 'Que fera Personnage 1 ?', eventIds: [eventId(1)] }]
  rawStory.ending.characters.push(...[5, 6].map(number => ({
    character: `Personnage ${number}`,
    text: `Personnage ${number} reste en place.`,
    eventIds: [eventId(number)],
  })))
  const story = normalizeRecapStory(rawStory, snapshot, eventGraph)
  const plan = planStorySlides(story, eventGraph, snapshot)
  const bilans = plan.filter(slide => slide.content.kind === 'changes' && slide.content.episodeNumber === 1)

  // Seven lines: deaths first, five a slide, then the question closes the second slide.
  assert.deepEqual(
    bilans.map(slide => [slide.content.deaths.length, slide.content.situations.length, slide.content.questions.length]),
    [[2, 3, 0], [0, 2, 1]],
  )
  assert.equal(bilans[0].content.nextEpisode, null)
  assert.deepEqual(bilans[1].content.nextEpisode, { number: 2, title: 'Épisode 2' })
  assert.deepEqual(plan.filter(slide => slide.content.kind === 'ending-status').map(slide => slide.content.characters.length), [4, 1])
})

test('donne à chaque slide d’un chapitre sa propre image, puis des images de fond', () => {
  const eventGraph = { ...createEventGraph(), characterAliases: [{ name: 'Personnage 3', aliases: ['Trois Durand'] }] }
  const stills = ['https://image.tmdb.org/t/p/w1280/e3-a.jpg', 'https://image.tmdb.org/t/p/w1280/e3-b.jpg']
  const backdrops = ['https://image.tmdb.org/t/p/w1280/fond-1.jpg', 'https://image.tmdb.org/t/p/w1280/fond-2.jpg']
  const imageSnapshot = {
    ...snapshot,
    show: { ...snapshot.show, backdrops },
    episodes: snapshot.episodes.map(episode => (episode.number === 3 ? { ...episode, stills } : episode)),
    imageFocus: { [stills[0]]: { x: 72, y: 25 } },
    characterPortraits: [
      { name: 'Personnage 3 « Trois » Durand', imageUrl: 'https://static.tvmaze.com/p3.jpg' },
      { name: 'Personnage 33', imageUrl: 'https://static.tvmaze.com/p33.jpg' },
    ],
  }
  const story = normalizeRecapStory(createRawStory(), imageSnapshot, eventGraph)
  const plan = planStorySlides(story, eventGraph, imageSnapshot)
  const chapter3 = plan.filter(slide => slide.content.episodeNumber === 3)

  // Card, moment and bilan: two stills, then the first backdrop.
  assert.deepEqual(chapter3.map(slide => slide.imageUrl), [...stills, backdrops[0]])
  // Without stills, an episode keeps its Trakt image, then takes the next backdrops.
  assert.deepEqual(
    plan.filter(slide => slide.content.episodeNumber === 4).map(slide => slide.imageUrl),
    ['https://walter-r2.trakt.tv/episode-4.webp', backdrops[1], backdrops[0]],
  )
  assert.equal(plan[0].imageUrl, null)
  // The crop follows the subject of an analysed image, and stays centered otherwise.
  assert.deepEqual(chapter3.map(slide => slide.imageFocus), [{ x: 72, y: 25 }, null, null])
  // "Personnage 3" fits both portraits; its alias "Trois Durand" fits one. "Personnage 6" has none.
  assert.equal(chapter3[1].content.characters[0].imageUrl, 'https://static.tvmaze.com/p3.jpg')
  assert.equal(plan.find(slide => slide.content.kind === 'ending-deaths').content.deaths[0].character.imageUrl, null)
})

test('produit des slides ordonnées au format v10', () => {
  const eventGraph = createEventGraph()
  const story = normalizeRecapStory(createRawStory(), snapshot, eventGraph)
  const slides = buildRecapSlides(story, snapshot, eventGraph)

  assert.deepEqual(slides.map(slide => slide.order), Array.from({ length: 1 + 8 * 3 + 3 }, (_, index) => index + 1))
  assert.ok(slides[1].canvas.children[0].children.some(node => node.attrs?.id === 'group-slide-2-headline'))
  assert.equal(slides[0].canvas.attrs.formatVersion, 10)
  assert.equal(slides[0].canvas.attrs.width, 390)
  assert.equal(slides[0].canvas.attrs.height, 844)
  assert.deepEqual(
    slides[0].canvas.children[0].children.slice(0, 4).map(node => node.className),
    ['Rect', 'Image', 'Rect', 'Group'],
  )
  assert.equal(slides[1].canvas.attrs.durationMs, 5_000)
  assert.ok(slides[2].canvas.attrs.durationMs >= 6_000)
  assert.ok(slides[2].canvas.attrs.durationMs <= 20_000)
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
  const compatible = '{{seasonQuickFacts}} {{eventGraph}} {{episodeMomentTargets}}'
  // A prompt written for season turning points predates the chapters format.
  const beatsPrompt = '{{seasonQuickFacts}} {{eventGraph}} {{targetBeatCount}}'

  assert.equal(isRecapPromptCompatible(compatible), true)
  assert.equal(isRecapPromptCompatible(beatsPrompt), false)
  assert.deepEqual(getMissingRecapPromptVariables(beatsPrompt), ['{{episodeMomentTargets}}'])
})

test('recap languages default to the display language and ignore unsupported values', () => {
  assert.deepEqual(recapLocales.getRecapLanguages(undefined, 'en'), ['en'])
  assert.deepEqual(recapLocales.getRecapLanguages([], 'fr'), ['fr'])
  assert.deepEqual(recapLocales.getRecapLanguages(['en-US', 'de', 'fr', 'en'], 'fr'), ['en', 'fr'])
  assert.deepEqual(recapLocales.getRecapLanguages('fr', 'en'), ['en'])
  assert.equal(recapLocales.normalizeRecapLocale(' FR '), 'fr')
  assert.equal(recapLocales.normalizeRecapLocale('es'), null)
})
