import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { deflateRawSync } from 'node:zlib'

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
  formatTranscript,
  parseSrtCues,
  rankSubtitleFiles,
  rankSubtitleLanguages,
} = await import('../../server/services/subtitle-recap-source.ts')
const {
  decodeSubtitle,
  pickEpisodeFile,
  readZipEntries,
  subdlProvider,
} = await import('../../server/services/subtitle-providers/subdl.ts')

/** A zip archive whose entries are deflated, or stored when stored is true. */
function zip(files, { stored = false } = {}) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name)
    const raw = Buffer.from(text)
    const data = stored ? raw : deflateRawSync(raw)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(stored ? 0 : 8, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(stored ? 0 : 8, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, data)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + data.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

const srt = [
  '﻿1',
  '00:00:01,000 --> 00:00:03,000',
  '<i>Subtitles by OpenSubtitles</i>',
  '',
  '2',
  '00:00:04,000 --> 00:00:06,000',
  '- Où est le collier ?',
  '- ASSANE: Au Louvre.',
  '',
  '3',
  '00:00:06,500 --> 00:00:07,000',
  '- Où est le collier ?\n- ASSANE: Au Louvre.',
  '',
  '4',
  '00:01:10,000 --> 00:01:12,000',
  '♪ Une chanson ♪ (sirène)',
  '',
].join('\r\n')

test('lit les répliques sans crédits, balises, doublons ni paroles de chanson', () => {
  const cues = parseSrtCues(srt)

  assert.deepEqual(cues, [
    { minute: 0, text: '- Où est le collier ? - ASSANE: Au Louvre.' },
    { minute: 1, text: '(sirène)' },
  ])
})

test('marque chaque nouvelle minute dans la transcription', () => {
  assert.equal(formatTranscript(parseSrtCues(srt)), '[00:00]\n- Où est le collier ? - ASSANE: Au Louvre.\n[01:00]\n(sirène)')
})

test('préfère la langue originale, puis le français et l’anglais', () => {
  assert.deepEqual(rankSubtitleLanguages('ko'), ['ko', 'fr', 'en'])
  assert.deepEqual(rankSubtitleLanguages('fr'), ['fr', 'en'])
  assert.deepEqual(rankSubtitleLanguages(null), ['fr', 'en'])
})

test('lit les fichiers compressés et stockés d’une archive zip', () => {
  const entries = readZipEntries(zip({ 'Lupin.S01E06.srt': '1\n00:00:01,000 --> 00:00:02,000\nBonjour' }))
  const stored = readZipEntries(zip({ 'a.srt': 'stocké' }, { stored: true }))

  assert.equal(entries[0].name, 'Lupin.S01E06.srt')
  assert.match(entries[0].data.toString(), /Bonjour$/)
  assert.equal(stored[0].data.toString(), 'stocké')
})

test('choisit le fichier de l’épisode dans une archive de plusieurs épisodes', () => {
  const entries = readZipEntries(zip({ 'Lupin.S01E05.srt': 'cinq', 'Lupin.S01E06.srt': 'six', 'Lupin 1x07.srt': 'sept', 'lisez-moi.txt': 'non' }))

  assert.equal(pickEpisodeFile(entries, { seasonNumber: 1, episodeNumber: 6 }).toString(), 'six')
  assert.equal(pickEpisodeFile(entries, { seasonNumber: 1, episodeNumber: 7 }).toString(), 'sept')
  assert.equal(pickEpisodeFile(entries, { seasonNumber: 1, episodeNumber: 16 }), null)
  assert.equal(pickEpisodeFile(readZipEntries(zip({ 'release.srt': 'seul' })), { seasonNumber: 1, episodeNumber: 6 }).toString(), 'seul')
  assert.equal(pickEpisodeFile(readZipEntries(zip({ 'release.srt': 'seul' })), { seasonNumber: 1, episodeNumber: 6 }, { requireNumber: true }), null)
})

test('décode les sous-titres français en UTF-8, UTF-16 et Windows-1252', () => {
  assert.equal(decodeSubtitle(Buffer.from('Désolé')), 'Désolé')
  assert.equal(decodeSubtitle(Buffer.from([0xff, 0xfe, ...Buffer.from('Été', 'utf16le')])), 'Été')
  assert.equal(decodeSubtitle(Buffer.from([0x44, 0xe9, 0x6a, 0xe0])), 'Déjà')
})

test('classe les fichiers par langue, puis par téléchargements avec un bonus pour les sourds', () => {
  const files = [
    { key: 'en', language: 'en', hearingImpaired: true, downloadCount: 900 },
    { key: 'fr-rare-hi', language: 'fr', hearingImpaired: true, downloadCount: 16 },
    { key: 'fr', language: 'fr', hearingImpaired: false, downloadCount: 6_230 },
    { key: 'fr-hi', language: 'fr', hearingImpaired: true, downloadCount: 2_500 },
    { key: 'de', language: 'de', hearingImpaired: true, downloadCount: 9_999 },
  ]

  assert.deepEqual(rankSubtitleFiles(files, ['fr', 'en']).map(file => file.key), ['fr-hi', 'fr', 'fr-rare-hi', 'en'])
})

test('Subdl cherche par identifiant TMDB, met les packs de saison après les fichiers de l’épisode', async () => {
  const previousFetch = globalThis.$fetch
  const previousKey = process.env.SUBDL_API_KEY
  const requests = []
  process.env.SUBDL_API_KEY = 'test-key'
  globalThis.$fetch = async (url, options) => {
    requests.push({ url, query: options.query })
    return {
      status: true,
      subtitles: [
        { url: '/subtitle/pack.zip?api_key=secret', language: 'FR', season: 1, full_season: true },
        { url: '/subtitle/s2.zip', language: 'FR', season: 2, full_season: true },
        { url: '/subtitle/e5.zip', language: 'FR', season: 1, episode: 5 },
        { url: '/subtitle/e5-7.zip', language: 'EN', season: 1, episode_from: 5, episode_end: 7 },
        { url: '/subtitle/e6.zip?api_key=secret', lang: 'french', season: 1, episode: 6, hi: true, subtitlePage: '/s/info/abc' },
      ],
    }
  }
  try {
    const files = await subdlProvider.search({
      showImdbId: 'tt2531336', showTmdbId: 96677, episodeImdbId: 'tt12657110', seasonNumber: 1, episodeNumber: 6, languages: ['fr', 'en'],
    })

    assert.equal(requests[0].query.tmdb_id, 96677)
    assert.equal(requests[0].query.imdb_id, undefined)
    assert.equal(requests[0].query.languages, 'FR,EN')
    assert.deepEqual(files.map(file => [file.key, file.language, file.hearingImpaired]), [
      ['subdl:/subtitle/e6.zip', 'fr', true],
      ['subdl:/subtitle/pack.zip', 'fr', false],
    ])
    assert.equal(files[0].url, 'https://subdl.com/s/info/abc')
    assert.ok(files.every(file => !file.key.includes('secret')))
  } finally {
    globalThis.$fetch = previousFetch
    if (previousKey === undefined) delete process.env.SUBDL_API_KEY
    else process.env.SUBDL_API_KEY = previousKey
  }
})
