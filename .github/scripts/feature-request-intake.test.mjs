import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildNormalizedBrief,
  buildStatusComment,
  handleFeatureRequest,
  isTrustedAssociation,
  normalizeFeatureRequest,
  parseSections,
  validateFeatureRequest,
} from './feature-request-intake.mjs'

const completeBody = `<!-- synupsis-ai-request:v1 -->
### Problème à résoudre

Les utilisateurs perdent leur progression.

### Utilisateurs concernés

Utilisateurs connectés

### Résultat attendu

Reprendre une story au bon endroit.

### Parcours utilisateur imaginé

1. Ouvrir un récap
2. Continuer la lecture

### Critères de validation

- [ ] La progression est mémorisée

### Impact possible sur les données

De nouvelles données seront probablement nécessaires

### Contraintes et éléments à préserver

Le visionnage anonyme doit continuer à fonctionner.

### Références utiles

_No response_
`

test('parseSections supports GitHub Issue Form markdown', () => {
  const sections = parseSections(completeBody)

  assert.equal(sections.get('Problème à résoudre'), 'Les utilisateurs perdent leur progression.')
  assert.equal(sections.get('Références utiles'), '')
})

test('normalizeFeatureRequest returns a stable agent-facing shape', () => {
  const request = normalizeFeatureRequest(completeBody)

  assert.equal(request.audience, 'Utilisateurs connectés')
  assert.match(request.acceptance, /progression est mémorisée/)
  assert.equal(request.references, '')
  assert.deepEqual(validateFeatureRequest(request), [])
})

test('validateFeatureRequest lists sections removed during an edit', () => {
  const request = normalizeFeatureRequest(completeBody.replace('Reprendre une story au bon endroit.', ''))

  assert.deepEqual(validateFeatureRequest(request), ['Résultat attendu'])
})

test('only repository owners, members and collaborators are trusted', () => {
  assert.equal(isTrustedAssociation('OWNER'), true)
  assert.equal(isTrustedAssociation('member'), true)
  assert.equal(isTrustedAssociation('COLLABORATOR'), true)
  assert.equal(isTrustedAssociation('CONTRIBUTOR'), false)
  assert.equal(isTrustedAssociation('NONE'), false)
})

test('ready comments contain the normalized brief without live mentions', () => {
  const request = normalizeFeatureRequest(completeBody.replace('Les utilisateurs', '@product Les utilisateurs'))
  const brief = buildNormalizedBrief(request)
  const comment = buildStatusComment({ featureRequest: request, missingFields: [], trusted: true })

  assert.match(comment, /Demande prête pour spécification/)
  assert.match(brief, /Brief initial normalisé/)
  assert.equal(brief.includes('@product'), false)
  assert.equal(brief.includes('@\u200bproduct'), true)
})

test('untrusted requests require approval and do not echo their content', () => {
  const request = normalizeFeatureRequest(completeBody)
  const comment = buildStatusComment({ featureRequest: request, missingFields: [], trusted: false })

  assert.match(comment, /attente d’approbation/)
  assert.equal(comment.includes(request.problem), false)
})

test('handleFeatureRequest creates labels and one reusable status comment', async () => {
  const createdLabels = []
  const addedLabels = []
  const comments = []
  const outputs = new Map()
  const github = {
    rest: {
      issues: {
        getLabel: async () => {
          const error = new Error('Not found')
          error.status = 404
          throw error
        },
        createLabel: async (label) => createdLabels.push(label.name),
        addLabels: async ({ labels }) => addedLabels.push(...labels),
        removeLabel: async () => {},
        listComments: async () => {},
        createComment: async ({ body }) => comments.push(body),
        updateComment: async () => {},
      },
    },
    paginate: async () => [],
  }
  const context = {
    repo: { owner: 'synupsis', repo: 'synupsis-web' },
    payload: {
      issue: {
        number: 42,
        body: completeBody,
        author_association: 'MEMBER',
        labels: [],
      },
    },
  }
  const core = {
    info: () => {},
    setOutput: (name, value) => outputs.set(name, value),
  }

  await handleFeatureRequest({ github, context, core })

  assert.equal(createdLabels.length, 4)
  assert.deepEqual(addedLabels.sort(), ['ai:ready-for-spec', 'ai:request'])
  assert.equal(comments.length, 1)
  assert.match(comments[0], /Demande prête pour spécification/)
  assert.equal(outputs.get('intake-status'), 'ai:ready-for-spec')
})
