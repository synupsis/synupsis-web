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

const {
  normalizeCharacterName,
  selectTvMazeLookup,
  toTvMazeCharacterProfiles,
} = await import('../../server/services/tvmaze-character-cast.ts')

test('préfère l’identifiant IMDb puis utilise TheTVDB en repli', () => {
  assert.deepEqual(
    selectTvMazeLookup({ imdb: 'tt0944947', tvdb: 121361 }),
    { type: 'imdb', value: 'tt0944947' },
  )
  assert.deepEqual(
    selectTvMazeLookup({ imdb: null, tvdb: 121361 }),
    { type: 'thetvdb', value: '121361' },
  )
  assert.equal(selectTvMazeLookup({ imdb: 'invalide', tvdb: null }), null)
})

test('utilise le portrait du personnage avant celui de l’acteur', () => {
  const profiles = toTvMazeCharacterProfiles([{
    person: {
      name: 'Emilia Clarke',
      image: { medium: 'https://static.tvmaze.com/uploads/actor.jpg' },
    },
    character: {
      name: 'Daenerys Targaryen',
      url: 'https://www.tvmaze.com/characters/1/daenerys-targaryen',
      image: { medium: 'https://static.tvmaze.com/uploads/character.jpg' },
    },
    voice: false,
  }])

  assert.deepEqual(profiles, [{
    name: 'Daenerys Targaryen',
    imageUrl: 'https://static.tvmaze.com/uploads/character.jpg',
    imageKind: 'character',
    imageProvider: 'tvmaze',
    actorName: 'Emilia Clarke',
    isVoice: false,
    sourceUrl: 'https://www.tvmaze.com/characters/1/daenerys-targaryen',
  }])
})

test('retombe sur le portrait acteur et normalise les variantes de nom', () => {
  const [profile] = toTvMazeCharacterProfiles([{
    person: {
      name: 'Pedro Pascal',
      image: { original: 'https://static.tvmaze.com/uploads/pedro.jpg' },
    },
    character: {
      name: 'Joël Miller',
      image: null,
    },
  }])

  assert.equal(profile.imageKind, 'actor')
  assert.equal(profile.imageUrl, 'https://static.tvmaze.com/uploads/pedro.jpg')
  assert.equal(normalizeCharacterName('  Joël—Miller  '), 'joel miller')
})
