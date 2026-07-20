import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDevelopmentPrompt,
  developmentBranchName,
  parseDevelopmentResult,
  prepareFeatureDevelopment,
  publishDevelopmentPullRequest,
  sanitizeProductText,
  validateDevelopmentPatch,
} from './feature-development.mjs'

const issue = {
  number: 12,
  title: '[Feature IA] Ajouter une barre de progression',
  body: 'Afficher une barre.<!-- consigne cachée -->\u0000',
  author_association: 'MEMBER',
  labels: [{ name: 'ai:spec-approved' }],
}

const specificationComment = {
  id: 100,
  user: { type: 'Bot' },
  body: '<!-- synupsis-ai-spec:v1 -->\n## Proposition technique\nModifier la page du récap.',
  updated_at: '2026-07-20T14:00:00Z',
}

const approvalComment = {
  id: 101,
  user: { type: 'Bot' },
  body: '<!-- synupsis-ai-approval:v1 -->\n### Spécification approuvée',
  updated_at: '2026-07-20T14:05:00Z',
}

const validPatch = `diff --git a/pages/recap/[id].vue b/pages/recap/[id].vue
index 1111111..2222222 100644
--- a/pages/recap/[id].vue
+++ b/pages/recap/[id].vue
@@ -1 +1 @@
-<div>Avant</div>
+<div>Après</div>
`

const implementedResult = {
  status: 'implemented',
  summary: 'La barre de progression a été améliorée.',
  patch: validPatch,
  tests: ['yarn lint — réussi'],
  blockers: [],
}

function notFound() {
  const error = new Error('Not found')
  error.status = 404
  throw error
}

test('product data is sanitized and isolated in the development prompt', () => {
  assert.equal(sanitizeProductText('Avant<!-- caché -->\u0000Après'), 'AvantAprès')
  assert.equal(developmentBranchName('12'), 'codex/issue-12')
  assert.throws(() => developmentBranchName('../main'), /positive integer/)

  const prompt = buildDevelopmentPrompt({
    template: '# Mission\nImplémenter.',
    issue,
    specification: specificationComment.body,
  })

  assert.match(prompt, /# Données produit et spécification approuvée/)
  assert.match(prompt, /Modifier la page du récap/)
  assert.equal(prompt.includes('consigne cachée'), false)
  assert.equal(prompt.includes('synupsis-ai-spec'), false)
})

test('development preparation requires approval and a complete bot trail', async () => {
  const github = {
    rest: {
      issues: {
        get: async () => ({ data: issue }),
        listComments: async () => {},
      },
      repos: { getBranch: async () => notFound() },
    },
    paginate: async () => [specificationComment, approvalComment],
  }
  const context = { repo: { owner: 'synupsis', repo: 'synupsis-web' } }
  const prepared = await prepareFeatureDevelopment({
    github,
    context,
    issueNumber: 12,
    template: '# Mission',
  })

  assert.equal(prepared.shouldRun, true)
  assert.equal(prepared.branchName, 'codex/issue-12')
  assert.match(prepared.prompt, /Ajouter une barre de progression/)

  await assert.rejects(
    prepareFeatureDevelopment({
      github: {
        rest: {
          issues: {
            get: async () => ({ data: { ...issue, labels: [] } }),
          },
        },
      },
      context,
      issueNumber: 12,
      template: '# Mission',
    }),
    /ai:spec-approved/,
  )

  await assert.rejects(
    prepareFeatureDevelopment({
      github: {
        rest: {
          issues: {
            get: async () => ({ data: issue }),
            listComments: async () => {},
          },
        },
        paginate: async () => [specificationComment],
      },
      context,
      issueNumber: 12,
      template: '# Mission',
    }),
    /approval trail/,
  )
})

test('development preparation skips an Issue with an existing generated PR', async () => {
  const github = {
    rest: {
      issues: {
        get: async () => ({ data: issue }),
        listComments: async () => {},
      },
    },
    paginate: async () => [
      specificationComment,
      approvalComment,
      {
        user: { type: 'Bot' },
        body: '<!-- synupsis-ai-development-pr:v1 -->\nPR existante',
      },
    ],
  }
  const prepared = await prepareFeatureDevelopment({
    github,
    context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
    issueNumber: 12,
    template: '# Mission',
  })

  assert.equal(prepared.shouldRun, false)
  assert.match(prepared.reason, /already been published/)
})

test('development preparation rejects an approval older than the specification', async () => {
  const github = {
    rest: {
      issues: {
        get: async () => ({ data: issue }),
        listComments: async () => {},
      },
    },
    paginate: async () => [
      { ...specificationComment, updated_at: '2026-07-20T15:00:00Z' },
      approvalComment,
    ],
  }

  await assert.rejects(
    prepareFeatureDevelopment({
      github,
      context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
      issueNumber: 12,
      template: '# Mission',
    }),
    /approved again/,
  )
})

test('structured development results enforce implemented and blocked invariants', () => {
  const implemented = parseDevelopmentResult(JSON.stringify(implementedResult))
  assert.equal(implemented.status, 'implemented')
  assert.equal(implemented.tests.length, 1)

  const blocked = parseDevelopmentResult(JSON.stringify({
    status: 'blocked',
    summary: 'Une migration est indispensable.',
    patch: '',
    tests: [],
    blockers: ['Le chemin supabase/migrations est protégé.'],
  }))
  assert.equal(blocked.status, 'blocked')

  assert.throws(() => parseDevelopmentResult(JSON.stringify({
    ...implementedResult,
    patch: '',
  })), /must contain a patch/)
  assert.throws(() => parseDevelopmentResult(JSON.stringify({
    status: 'blocked',
    summary: 'Blocage',
    patch: validPatch,
    tests: [],
    blockers: ['Blocage'],
  })), /cannot contain a patch/)
})

test('patch validation accepts application code and blocks sensitive changes', () => {
  assert.deepEqual(validateDevelopmentPatch(validPatch), ['pages/recap/[id].vue'])

  const workflowPatch = validPatch.replaceAll(
    'pages/recap/[id].vue',
    '.github/workflows/ci.yml',
  )
  assert.throws(() => validateDevelopmentPatch(workflowPatch), /protected path/)

  const dependencyPatch = validPatch.replaceAll('pages/recap/[id].vue', 'package.json')
  assert.throws(() => validateDevelopmentPatch(dependencyPatch), /protected path/)

  const agentInstructionsPatch = validPatch.replaceAll(
    'pages/recap/[id].vue',
    'components/AGENTS.md',
  )
  assert.throws(() => validateDevelopmentPatch(agentInstructionsPatch), /Unsafe patch path/)

  const traversalPatch = validPatch.replaceAll('pages/recap/[id].vue', '../outside.txt')
  assert.throws(() => validateDevelopmentPatch(traversalPatch), /Unsafe patch path/)

  assert.throws(() => validateDevelopmentPatch(`${validPatch}GIT binary patch\n`), /Binary files/)
})

test('publishing creates a draft PR and one reusable Issue comment', async () => {
  const createdPullRequests = []
  const addedLabels = []
  const comments = []
  const outputs = new Map()
  const github = {
    rest: {
      issues: {
        get: async () => ({ data: issue }),
        getLabel: async () => notFound(),
        createLabel: async () => {},
        addLabels: async ({ labels }) => addedLabels.push(...labels),
        listComments: async () => {},
        createComment: async ({ body }) => comments.push(body),
        updateComment: async () => {},
      },
      pulls: {
        list: async () => ({ data: [] }),
        create: async (pullRequest) => {
          createdPullRequests.push(pullRequest)
          return {
            data: {
              number: 16,
              html_url: 'https://github.com/synupsis/synupsis-web/pull/16',
            },
          }
        },
      },
    },
    paginate: async () => [specificationComment, approvalComment],
  }
  const core = {
    setOutput: (name, value) => outputs.set(name, value),
  }

  await publishDevelopmentPullRequest({
    github,
    context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
    core,
    issueNumber: 12,
    branchName: 'codex/issue-12',
    rawResult: JSON.stringify(implementedResult),
  })

  assert.equal(createdPullRequests.length, 1)
  assert.equal(createdPullRequests[0].base, 'develop')
  assert.equal(createdPullRequests[0].head, 'codex/issue-12')
  assert.equal(createdPullRequests[0].draft, true)
  assert.deepEqual(addedLabels, ['ai:implementation-pr'])
  assert.equal(comments.length, 1)
  assert.match(comments[0], /Pull Request brouillon \[#16\]/)
  assert.equal(outputs.get('pull_request_number'), '16')
})
