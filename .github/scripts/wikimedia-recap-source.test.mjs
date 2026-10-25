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
  extractPlotSection,
  extractSeasonOverview,
  extractSeasonSectionsHtml,
  parseEpisodeSummaries,
} = await import('../../server/services/wikimedia-recap-source.ts')

const plot = (detail) => `${detail} ${'Les conséquences de cette scène précise sont racontées en détail. '.repeat(4)}`.trim()

function episodeRow({ overall, inSeason, title, link, description }) {
  const titleCell = link
    ? `"<a href="/wiki/${encodeURIComponent(link)}" title="${link}">${title}</a>"`
    : `"${title}"`
  return `<tr class="vevent module-episode-list-row"><th scope="row" id="ep${overall}">${overall}</th>`
    + `<td style="text-align:center">${inSeason}</td><td class="summary">${titleCell}</td>`
    + '<td>Réalisateur</td><td>April&#160;17,&#160;2011</td></tr>'
    + `<tr class="expand-child"><td class="description" colspan="7"><div class="shortSummaryText">${description}</div></td></tr>`
}

function heading(level, text) {
  const id = text.replace(/<[^>]+>/g, '').replace(/ /g, '_')
  return `<div class="mw-heading mw-heading${level}"><h${level} id="${id}">${text}</h${level}></div>`
}

const seriesPage = [
  '<p>Une série allemande.</p>',
  heading(2, 'Episodes'),
  heading(3, 'Season 1 (2017)'),
  '<table class="wikitable plainrowheaders wikiepisodetable"><tbody>',
  episodeRow({ overall: 1, inSeason: 1, title: 'Secrets', description: plot('Mikkel disparaît dans la grotte pendant la panne.') }),
  episodeRow({ overall: 2, inSeason: 2, title: 'Lies', description: plot('Le garçon retrouvé porte des vêtements des années 1980.') }),
  '</tbody></table>',
  heading(3, 'Season 2 (2019)'),
  '<table class="wikitable plainrowheaders wikiepisodetable"><tbody>',
  episodeRow({ overall: 11, inSeason: 1, title: 'Beginnings and Endings', description: plot('Jonas vit en 2052 dans un monde dévasté.') }),
  '</tbody></table>',
  heading(2, 'Music'),
  heading(3, 'Season 1'),
  '<p>La bande originale de la première saison.</p>',
].join('')

test('extrait les résumés de la bonne saison sur une page de série', () => {
  const sections = extractSeasonSectionsHtml(seriesPage, 2, 'en')
  const summaries = sections.map(parseEpisodeSummaries).find(result => result.size > 0)

  assert.equal(sections.length, 1)
  assert.deepEqual([...summaries.keys()], [1])
  assert.match(summaries.get(1).text, /^Jonas vit en 2052/)
})

test('ignore les sections homonymes sans tableau d’épisodes', () => {
  const sections = extractSeasonSectionsHtml(seriesPage, 1, 'en')
  const summaries = sections.map(parseEpisodeSummaries).find(result => result.size > 0)

  assert.equal(sections.length, 2)
  assert.deepEqual([...summaries.keys()], [1, 2])
  assert.match(summaries.get(2).text, /vêtements des années 1980/)
  assert.doesNotMatch(summaries.get(2).text, /Mikkel/)
})

test('lit le numéro dans la saison et le lien vers l’article d’épisode', () => {
  const html = [
    '<table class="wikiepisodetable"><tbody>',
    episodeRow({ overall: 1, inSeason: 1, title: 'Winter Is Coming', link: 'Winter Is Coming', description: plot('Ned exécute un déserteur de la Garde de Nuit.') }),
    episodeRow({ overall: 2, inSeason: 2, title: 'The Kingsroad', description: 'Trop court.' }),
    '</tbody></table>',
  ].join('')
  const summaries = parseEpisodeSummaries(html)

  assert.deepEqual([...summaries.keys()], [1])
  assert.equal(summaries.get(1).articleTitle, 'Winter Is Coming')
})

test('lit le résumé détaillé d’un article de saison français', () => {
  const html = [
    heading(2, 'Liste des épisodes'),
    heading(3, 'Épisode 1&#160;: <i>L\'hiver vient</i>'),
    '<div><div class="bandeau-cell">Article détaillé&#160;: <a href="/wiki/L%27hiver_vient" title="L&#39;hiver vient">L\'hiver vient</a>.</div>',
    '<b>Titre original</b><br /><div><i>Winter Is Coming</i></div>',
    '<b>Réalisation</b><br /><div>Tim Van Patten</div>',
    `<b>Résumé détaillé</b><br /><div>${plot('Jaime pousse Bran du haut de la tour.')}</div>`,
    '<b>Lieux présentés par le générique</b><br /><div>Port-Réal, Winterfell</div></div>',
    heading(3, 'Épisode 2&#160;: <i>La Route royale</i>'),
    '<b>Titre original</b><br /><div><i>The Kingsroad</i></div>',
  ].join('')
  const summaries = parseEpisodeSummaries(html)

  assert.deepEqual([...summaries.keys()], [1])
  assert.match(summaries.get(1).text, /^Jaime pousse Bran du haut de la tour\./)
  assert.doesNotMatch(summaries.get(1).text, /Tim Van Patten|Port-Réal/)
  assert.equal(summaries.get(1).articleTitle, 'L\'hiver vient')
})

test('reconnaît les intitulés de saison ordinaux en français', () => {
  const html = `${heading(3, 'Première saison (2017)')}<p>A</p>${heading(3, 'Deuxième saison (2019)')}<p>B</p>`
  const firstSeason = extractSeasonSectionsHtml(html, 1, 'fr')

  assert.equal(firstSeason.length, 1)
  assert.match(firstSeason[0], /<p>A<\/p>/)
  assert.doesNotMatch(firstSeason[0], /<p>B<\/p>/)
  assert.equal(extractSeasonSectionsHtml(html, 3, 'fr').length, 0)
})

test('extrait la section Plot d’un article d’épisode avec ses lieux', () => {
  const text = [
    'Winter Is Coming is the first episode.',
    '',
    '== Plot ==',
    '',
    '=== Beyond the Wall ===',
    plot('Des rangers découvrent des sauvageons massacrés.'),
    '',
    '=== In King\'s Landing ===',
    'Jon Arryn meurt subitement.',
    '',
    '== Production ==',
    'Le pilote a été retourné.',
  ].join('\n')
  const section = extractPlotSection(text, 'en')

  assert.match(section, /^Beyond the Wall: Des rangers découvrent/)
  assert.match(section, /In King's Landing: Jon Arryn meurt subitement\.$/)
  assert.doesNotMatch(section, /retourné/)
  assert.equal(extractPlotSection('== Production ==\nRien.', 'en'), null)
})

test('extrait le résumé de saison français sans la distribution', () => {
  const html = [
    heading(2, 'Distribution'),
    '<p>Jeremy Allen White : Carmen Berzatto</p>',
    heading(2, 'Résumé de la saison'),
    `<p>${plot('Carmy hérite de la sandwicherie de son frère.')}</p>`,
    heading(2, 'Épisodes'),
  ].join('')

  assert.match(extractSeasonOverview(html, 'fr'), /^Carmy hérite de la sandwicherie/)
  assert.equal(extractSeasonOverview(heading(2, 'Distribution'), 'fr'), null)
})
