// Measures how many must-have scenes the timeline and the recap of each
// season contain, using evals/recap/must-have-scenes.json as the reference.
// Usage: yarn eval:recaps [--format-version 7] [--out report.json]
import fs from 'node:fs'
import OpenAI from 'openai'

const args = process.argv.slice(2)
const option = name => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}
const formatVersion = option('format-version')
const outFile = option('out')
const dataset = JSON.parse(fs.readFileSync(new URL('../evals/recap/must-have-scenes.json', import.meta.url), 'utf8'))

const { NUXT_PUBLIC_SUPABASE_URL: supabaseUrl, NUXT_SUPABASE_SECRET_KEY: secretKey, OPENAI_API_KEY: openAiKey } = process.env
if (!supabaseUrl || !secretKey || !openAiKey) {
  console.error('NUXT_PUBLIC_SUPABASE_URL, NUXT_SUPABASE_SECRET_KEY and OPENAI_API_KEY are required.')
  process.exit(1)
}
const model = process.env.OPENAI_EVAL_MODEL || process.env.OPENAI_RECAP_MODEL || 'gpt-5.6'
const openai = new OpenAI({ apiKey: openAiKey })

const judgeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'inTimeline', 'inRecap'],
        properties: {
          id: { type: 'string' },
          inTimeline: { type: 'boolean' },
          inRecap: { type: 'boolean' },
        },
      },
    },
  },
}

async function rest(path) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: { apikey: secretKey } })
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  return response.json()
}

async function loadRecap(entry) {
  const [show] = await rest(`show?trakt_id=eq.${entry.traktId}&select=id`)
  if (!show) return null
  const [season] = await rest(`season?show_id=eq.${show.id}&number=eq.${entry.season}&select=id`)
  if (!season) return null
  const versionFilter = formatVersion ? `&format_version=eq.${formatVersion}` : ''
  const [recap] = await rest(
    `recap?season_id=eq.${season.id}&status=eq.published&is_canonical=eq.true${versionFilter}`
      + '&order=format_version.desc&limit=1&select=id,format_version,event_graph,story_data',
  )
  return recap ?? null
}

// The judge only compares texts of the same episode: a scene placed in the
// wrong episode counts as missing.
function createJudgePrompt(entry, recap) {
  const events = recap.event_graph?.events ?? []
  const story = recap.story_data ?? {}
  const episodes = [...new Set(entry.mustHave.map(item => item.episode))].sort((a, b) => a - b)
  const sections = episodes.map((episode) => {
    const expected = entry.mustHave
      .filter(item => item.episode === episode)
      .map(item => `- [${item.id}] ${item.scene}`)
    const scenes = events
      .filter(event => event.episodeNumbers?.includes(episode))
      .map(event => `- ${event.title} : ${event.description}${event.detail ? ` (${event.detail})` : ''}`)
    const recapTexts = [
      ...(story.beats ?? [])
        .filter(beat => beat.episodeNumbers?.includes(episode))
        .map(beat => `- ${beat.headline} : ${beat.narration}`),
      ...(story.episodes ?? [])
        .filter(item => item.episodeNumber === episode)
        .flatMap(item => item.moments.map(moment => `- ${moment.text}`)),
    ]
    return [
      `## Épisode ${episode}`,
      '### Scènes attendues',
      ...expected,
      '### Timeline',
      ...(scenes.length ? scenes : ['(aucune scène)']),
      '### Recap',
      ...(recapTexts.length ? recapTexts : ['(aucun texte)']),
    ].join('\n')
  })

  return [
    `Tu évalues la timeline et le recap de ${entry.show}, saison ${entry.season}.`,
    'Pour chaque scène attendue, inTimeline vaut true si la timeline de cet épisode contient le même fait essentiel (mêmes personnages, même action), même formulé autrement.',
    'inRecap vaut true si les textes du recap de cet épisode rapportent ce fait.',
    'Un fait seulement voisin, plus vague, ou attribué à un autre personnage ne compte pas. Réponds pour chaque identifiant.',
    '',
    sections.join('\n\n'),
  ].join('\n')
}

function percent(count, total) {
  return total ? `${Math.round((count / total) * 100)} %` : '-'
}

const report = { model, formatVersion: formatVersion ?? 'latest', seasons: [] }

for (const entry of dataset.seasons) {
  const label = `${entry.show} S${entry.season}`
  if (!entry.mustHave?.length) {
    console.log(`${label} : aucune scène attendue, ignorée.`)
    continue
  }
  const recap = await loadRecap(entry)
  if (!recap) {
    console.log(`${label} : aucun recap publié${formatVersion ? ` en v${formatVersion}` : ''}.`)
    continue
  }

  const response = await openai.responses.create({
    model,
    input: createJudgePrompt(entry, recap),
    text: { format: { type: 'json_schema', name: 'recap_eval', strict: true, schema: judgeSchema } },
  })
  const results = new Map(JSON.parse(response.output_text).results.map(result => [result.id, result]))
  const items = entry.mustHave.map(item => ({ ...item, ...(results.get(item.id) ?? { inTimeline: false, inRecap: false }) }))
  const inTimeline = items.filter(item => item.inTimeline)
  const inRecap = items.filter(item => item.inRecap)

  console.log(`\n${label} · recap v${recap.format_version} · ${recap.event_graph?.events?.length ?? 0} scènes${entry.status === 'draft' ? ' · référence à relire' : ''}`)
  console.log(`  timeline : ${inTimeline.length}/${items.length} (${percent(inTimeline.length, items.length)})`)
  console.log(`  recap    : ${inRecap.length}/${items.length} (${percent(inRecap.length, items.length)})`)
  items.filter(item => !item.inTimeline).forEach(item => console.log(`  absent de la timeline · E${item.episode} ${item.scene}`))

  report.seasons.push({
    show: entry.show,
    season: entry.season,
    recapId: recap.id,
    formatVersion: recap.format_version,
    timelineRecall: items.length ? inTimeline.length / items.length : null,
    recapRecall: items.length ? inRecap.length / items.length : null,
    items,
  })
}

if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 2))
