import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSpecificationComment,
  buildSpecificationPrompt,
  parseSpecificationResult,
  prepareFeatureSpecification,
  publishFeatureSpecification,
  publishFeatureSpecificationFailure,
  sanitizeIssueText,
} from './feature-specification.mjs'

const readyIssue = {
  number: 12,
  title: 'Barre de progression',
  body: '### Résultat attendu\n\nAfficher la progression.<!-- instruction cachée -->\u0000',
  author_association: 'MEMBER',
  labels: [{ name: 'ai:ready-for-spec' }],
}

test('sanitizeIssueText removes comments, controls and limits the input', () => {
  assert.equal(sanitizeIssueText('Avant<!-- caché -->\u0000Après'), 'AvantAprès')
  assert.equal(sanitizeIssueText('123456', 4), '1234')
})

test('buildSpecificationPrompt isolates sanitized Issue data', () => {
  const prompt = buildSpecificationPrompt({ template: '# Mission\nAnalyser.', issue: readyIssue })

  assert.match(prompt, /# Données non fiables/)
  assert.match(prompt, /"number": 12/)
  assert.match(prompt, /Afficher la progression/)
  assert.equal(prompt.includes('instruction cachée'), false)
  assert.equal(prompt.includes('\u0000'), false)
})

test('prepareFeatureSpecification accepts only trusted and ready Issues', async () => {
  const github = {
    rest: { issues: { get: async () => ({ data: readyIssue }) } },
  }
  const context = { repo: { owner: 'synupsis', repo: 'synupsis-web' } }
  const prepared = await prepareFeatureSpecification({
    github,
    context,
    issueNumber: '12',
    template: '# Mission',
  })

  assert.equal(prepared.issue.number, 12)
  assert.match(prepared.prompt, /Barre de progression/)

  await assert.rejects(
    prepareFeatureSpecification({
      github: {
        rest: {
          issues: {
            get: async () => ({
              data: { ...readyIssue, author_association: 'NONE' },
            }),
          },
        },
      },
      context,
      issueNumber: 12,
      template: '# Mission',
    }),
    /trusted repository member/,
  )

  await assert.rejects(
    prepareFeatureSpecification({
      github: {
        rest: {
          issues: {
            get: async () => ({ data: { ...readyIssue, labels: [] } }),
          },
        },
      },
      context,
      issueNumber: 12,
      template: '# Mission',
    }),
    /ai:ready-for-spec/,
  )
})

test('parseSpecificationResult validates and normalizes structured output', () => {
  const result = parseSpecificationResult(JSON.stringify({
    status: 'ready',
    specification: '  ## Résumé\nPrête.  ',
    questions: [],
  }))

  assert.equal(result.specification, '## Résumé\nPrête.')
  assert.throws(() => parseSpecificationResult('pas du JSON'), /valid JSON/)
  assert.throws(() => parseSpecificationResult(JSON.stringify({
    status: 'needs_clarification',
    specification: 'Analyse partielle',
    questions: [],
  })), /at least one question/)
  assert.throws(() => parseSpecificationResult(JSON.stringify({
    status: 'ready',
    specification: 'Analyse',
    questions: Array.from({ length: 11 }, () => 'Question'),
  })), /valid questions array/)
})

test('buildSpecificationComment prevents live GitHub mentions', () => {
  const comment = buildSpecificationComment({
    status: 'needs_clarification',
    specification: 'Il faut consulter @product.',
    questions: ['Faut-il prévenir @admin ?'],
  })

  assert.match(comment, /Clarifications nécessaires/)
  assert.equal(comment.includes('@product'), false)
  assert.equal(comment.includes('@admin'), false)
  assert.equal(comment.includes('@\u200bproduct'), true)
  assert.equal(comment.includes('@\u200badmin'), true)
})

test('publishFeatureSpecification creates labels and one reusable comment', async () => {
  const createdLabels = []
  const addedLabels = []
  const removedLabels = []
  const comments = []
  const outputs = new Map()
  const github = {
    rest: {
      issues: {
        get: async () => ({
          data: {
            ...readyIssue,
            labels: [
              { name: 'ai:ready-for-spec' },
              { name: 'ai:spec-needs-info' },
              { name: 'ai:spec-approved' },
            ],
          },
        }),
        getLabel: async () => {
          const error = new Error('Not found')
          error.status = 404
          throw error
        },
        createLabel: async ({ name }) => createdLabels.push(name),
        addLabels: async ({ labels }) => addedLabels.push(...labels),
        removeLabel: async ({ name }) => removedLabels.push(name),
        listComments: async () => {},
        createComment: async ({ body }) => comments.push(body),
        updateComment: async () => {},
      },
    },
    paginate: async () => [],
  }
  const context = { repo: { owner: 'synupsis', repo: 'synupsis-web' } }
  const core = {
    info: () => {},
    setOutput: (name, value) => outputs.set(name, value),
  }

  await publishFeatureSpecification({
    github,
    context,
    core,
    issueNumber: 12,
    rawResult: JSON.stringify({
      status: 'ready',
      specification: '## Résumé et objectif\nAfficher la progression.',
      questions: [],
    }),
  })

  assert.deepEqual(createdLabels.sort(), ['ai:spec-blocked', 'ai:spec-needs-info', 'ai:spec-ready'])
  assert.deepEqual(addedLabels, ['ai:spec-ready'])
  assert.deepEqual(removedLabels.sort(), ['ai:spec-approved', 'ai:spec-needs-info'])
  assert.equal(comments.length, 1)
  assert.match(comments[0], /Spécification proposée/)
  assert.match(comments[0], /\/approve-spec/)
  assert.equal(outputs.get('specification-status'), 'ai:spec-ready')
})

test('publishFeatureSpecificationFailure exposes the blocker to the Issue', async () => {
  const createdLabels = []
  const addedLabels = []
  const removedLabels = []
  const comments = []
  const outputs = new Map()
  const github = {
    rest: {
      issues: {
        get: async () => ({
          data: {
            ...readyIssue,
            labels: [
              { name: 'ai:ready-for-spec' },
              { name: 'ai:spec-ready' },
              { name: 'ai:spec-needs-info' },
            ],
          },
        }),
        getLabel: async () => {
          const error = new Error('Not found')
          error.status = 404
          throw error
        },
        createLabel: async ({ name }) => createdLabels.push(name),
        addLabels: async ({ labels }) => addedLabels.push(...labels),
        removeLabel: async ({ name }) => removedLabels.push(name),
        listComments: async () => {},
        createComment: async ({ body }) => comments.push(body),
        updateComment: async () => {},
      },
    },
    paginate: async () => [],
  }
  const context = {
    repo: { owner: 'synupsis', repo: 'synupsis-web' },
    serverUrl: 'https://github.com',
    runId: 12345,
  }
  const core = {
    warning: () => {},
    setOutput: (name, value) => outputs.set(name, value),
  }

  await publishFeatureSpecificationFailure({ github, context, core, issueNumber: 12 })

  assert.deepEqual(createdLabels, ['ai:spec-blocked'])
  assert.deepEqual(addedLabels, ['ai:spec-blocked'])
  assert.deepEqual(removedLabels.sort(), ['ai:spec-needs-info', 'ai:spec-ready'])
  assert.equal(comments.length, 1)
  assert.match(comments[0], /synupsis-ai-spec-blocked:v1/)
  assert.match(comments[0], /actions\/runs\/12345/)
  assert.equal(outputs.get('specification-status'), 'ai:spec-blocked')
})
