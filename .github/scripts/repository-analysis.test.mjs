import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRepositoryAnalysisComment,
  buildRepositoryAnalysisPrompt,
  parseRepositoryAnalysisResult,
  prepareRepositoryAnalysis,
} from './repository-analysis.mjs'

const trustedIssue = {
  number: 32,
  title: '[Analyse IA] État de l’internationalisation',
  body: '<!-- synupsis-ai-analysis-request:v1 -->\n### Question\n\nQuel est l’état de l’internationalisation ?',
  labels: [{ name: 'ai:analysis' }],
  author_association: 'NONE',
  user: {
    id: 307557269,
    login: 'synupsis-orchestrator[bot]',
    type: 'Bot',
  },
}

test('construit un prompt qui traite la question comme une donnée non fiable', () => {
  const prompt = buildRepositoryAnalysisPrompt({ template: '# Mission', issue: trustedIssue })
  assert.match(prompt, /Données non fiables/)
  assert.match(prompt, /internationalisation/)
  assert.doesNotMatch(prompt, /synupsis-ai-analysis-request/)
})

test('valide et normalise le rapport structuré', () => {
  assert.deepEqual(
    parseRepositoryAnalysisResult(JSON.stringify({ report: '  ## Réponse courte\nPrésent.  ' })),
    { report: '## Réponse courte\nPrésent.' },
  )
  assert.throws(() => parseRepositoryAnalysisResult('{'), /valid JSON/)
  assert.throws(() => parseRepositoryAnalysisResult(JSON.stringify({ report: '' })), /valid report/)
})

test('neutralise les mentions dans le commentaire publié', () => {
  const comment = buildRepositoryAnalysisComment({ report: 'Vérifier avec @product.' })
  assert.match(comment, /synupsis-ai-analysis-report:v1/)
  assert.match(comment, /@​product/)
  assert.match(comment, /Aucun fichier n’a été modifié/)
})

test('prépare uniquement une analyse créée par un acteur fiable', async () => {
  const github = {
    rest: {
      issues: {
        get: async () => ({ data: trustedIssue }),
      },
    },
  }
  const result = await prepareRepositoryAnalysis({
    github,
    context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
    issueNumber: 32,
    template: '# Mission',
  })
  assert.equal(result.issue.number, 32)

  const untrusted = {
    ...trustedIssue,
    user: { id: 1, login: 'attacker', type: 'User' },
  }
  await assert.rejects(
    prepareRepositoryAnalysis({
      github: { rest: { issues: { get: async () => ({ data: untrusted }) } } },
      context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
      issueNumber: 32,
      template: '# Mission',
    }),
    /trusted actor/,
  )
})
