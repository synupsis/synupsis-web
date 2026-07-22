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
  createRecapPrompt,
  evaluateRecapStory,
  normalizeRecapStory,
} = await import('../../server/services/recap-generation.ts')
const {
  getMissingRecapPromptVariables,
  isRecapPromptCompatible,
} = await import('../../lib/prompts/defaultPrompt.ts')

const snapshot = {
  provider: 'multi-source',
  fetchedAt: '2026-07-22T12:00:00.000Z',
  providers: [{
    id: 'trakt',
    label: 'Trakt',
    fetchedAt: '2026-07-22T12:00:00.000Z',
    sourceUrl: 'https://trakt.tv/shows/test',
    termsUrl: 'https://trakt.tv/terms',
  }],
  show: {
    id: 'show-id',
    traktId: 42,
    tmdbId: 43,
    tvdbId: 44,
    imdbId: 'tt0000042',
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
    const overview = `Synopsis source suffisamment précis pour l'épisode ${number}.`
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
      }],
    }
  }),
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
    narration: `Un moment factuel étayé par les épisodes ${episodeNumbers.join(' et ')}.`,
    tag: 'Moment clé',
    episodeNumbers,
    imageEpisodeNumber,
    evidenceIds: episodeNumbers.map(number => `trakt-e${number}-overview`),
  }
}

test('publie un récit suffisamment sourcé et couvrant la saison', () => {
  const story = normalizeRecapStory(createRawStory(), snapshot)
  const quality = evaluateRecapStory(story, snapshot)

  assert.equal(quality.publishable, true)
  assert.equal(quality.referenceValidity, 1)
  assert.equal(quality.episodeCoverage, 1)
  assert.deepEqual(quality.issues, [])
})

test('injecte les identifiants de preuve et leur provenance dans le prompt', () => {
  const prompt = createRecapPrompt(snapshot)

  assert.match(prompt, /\[trakt-e1-overview\]/)
  assert.match(prompt, /trakt\/en\/reference/)
  assert.match(prompt, /Chaque moment doit citer/)
})

test('bloque une référence absente ou incohérente au lieu de la masquer', () => {
  const rawStory = createRawStory()
  rawStory.beats[0].episodeNumbers = [1, 99]
  rawStory.beats[0].imageEpisodeNumber = 99

  const story = normalizeRecapStory(rawStory, snapshot)
  const quality = evaluateRecapStory(story, snapshot)

  assert.equal(quality.publishable, false)
  assert.ok(quality.referenceValidity < 1)
  assert.ok(quality.issues.includes('invalid_story_references'))
})

test('bloque une narration qui ne cite aucun fragment de preuve', () => {
  const rawStory = createRawStory()
  rawStory.beats[1].evidenceIds = []

  const story = normalizeRecapStory(rawStory, snapshot)
  const quality = evaluateRecapStory(story, snapshot)

  assert.equal(quality.publishable, false)
  assert.ok(quality.evidenceCoverage < 1)
  assert.ok(quality.issues.includes('uncited_story_beats'))
})

test('produit des slides ordonnées avec fond, image, overlay puis contenu', () => {
  const story = normalizeRecapStory(createRawStory(), snapshot)
  const slides = buildRecapSlides(story, snapshot)

  assert.deepEqual(slides.map(slide => slide.order), [1, 2, 3, 4, 5, 6])
  assert.equal(slides[0].canvas.attrs.formatVersion, 3)
  assert.equal(slides[0].canvas.attrs.width, 390)
  assert.equal(slides[0].canvas.attrs.height, 844)
  assert.deepEqual(
    slides[0].canvas.children[0].children.slice(0, 4).map(node => node.className),
    ['Rect', 'Image', 'Rect', 'Group'],
  )
  assert.ok(slides[1].canvas.attrs.durationMs >= 5_500)
  assert.ok(slides[1].canvas.attrs.durationMs <= 12_000)
})

test('détecte les prompts incompatibles avec le pipeline courant', () => {
  const compatible = '{{seasonQuickFacts}} {{episodeDetailedList}} {{targetBeatCount}}'
  const incompatible = '{{seasonQuickFacts}} {{episodeDetailedList}}'

  assert.equal(isRecapPromptCompatible(compatible), true)
  assert.equal(isRecapPromptCompatible(incompatible), false)
  assert.deepEqual(getMissingRecapPromptVariables(incompatible), ['{{targetBeatCount}}'])
})
