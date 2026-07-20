import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildReviewComment,
  buildReviewPrompt,
  issueNumberFromReviewBranch,
  parseFeatureReviewResult,
  prepareFeatureReview,
  publishFeatureReview,
  sanitizeReviewText,
} from './feature-review.mjs'

const headSha = 'a'.repeat(40)
const baseSha = 'b'.repeat(40)
const validPatch = `diff --git a/pages/recap/[id].vue b/pages/recap/[id].vue
index 1111111..2222222 100644
--- a/pages/recap/[id].vue
+++ b/pages/recap/[id].vue
@@ -1 +1 @@
-<div>Avant</div>
+<div>Après</div>
`

const pullRequest = {
  number: 17,
  state: 'open',
  draft: true,
  title: 'AI #12: Barre de progression',
  body: 'Implémentation de la spécification.',
  labels: [],
  head: {
    ref: 'codex/issue-12',
    sha: headSha,
    repo: { full_name: 'synupsis/synupsis-web' },
  },
  base: { ref: 'develop', sha: baseSha },
}

const issue = {
  number: 12,
  title: 'Ajouter une barre de progression',
  body: 'Afficher la progression.<!-- instruction cachée -->\u0000',
  author_association: 'MEMBER',
  labels: [
    { name: 'ai:spec-approved' },
    { name: 'ai:implementation-pr' },
  ],
}

const specificationComment = {
  user: { type: 'Bot' },
  body: '<!-- synupsis-ai-spec:v1 -->\n## Spécification\nAfficher la progression.',
  updated_at: '2026-07-20T10:00:00Z',
}

const approvalComment = {
  user: { type: 'Bot' },
  body: '<!-- synupsis-ai-approval:v1 -->\nSpécification approuvée.',
  updated_at: '2026-07-20T10:05:00Z',
}

const approvedResult = {
  verdict: 'approved',
  summary: 'Le patch respecte la spécification.',
  findings: [],
  strengths: ['La progression possède un libellé accessible.'],
  verification_steps: ['Vérifier la progression sur mobile.'],
  blockers: [],
}

function notFound() {
  const error = new Error('Not found')
  error.status = 404
  throw error
}

function reviewGithub({ currentPullRequest = pullRequest, currentIssue = issue, comments = [] } = {}) {
  return {
    rest: {
      pulls: {
        get: async () => ({ data: currentPullRequest }),
      },
      issues: {
        get: async ({ issue_number: issueNumber }) => ({
          data: issueNumber === currentPullRequest.number ? currentPullRequest : currentIssue,
        }),
        listComments: async () => {},
      },
    },
    request: async () => ({ data: validPatch }),
    paginate: async () => comments,
  }
}

test('review inputs are sanitized, isolated and tied to a generated branch', () => {
  assert.equal(issueNumberFromReviewBranch('codex/issue-12'), 12)
  assert.throws(() => issueNumberFromReviewBranch('feature/issue-12'), /Unexpected implementation branch/)
  assert.equal(sanitizeReviewText('Avant<!-- caché -->\u0000Après'), 'AvantAprès')

  const prompt = buildReviewPrompt({
    template: '# Mission\nReviewer.',
    pullRequest,
    issue,
    specification: specificationComment.body,
    patch: validPatch,
    changedPaths: ['pages/recap/[id].vue'],
  })

  assert.match(prompt, /# Données non fiables de la review/)
  assert.match(prompt, /codex\/issue-12/)
  assert.match(prompt, /pages\/recap\/\[id\]\.vue/)
  assert.equal(prompt.includes('instruction cachée'), false)
  assert.equal(prompt.includes('synupsis-ai-spec'), false)
})

test('review preparation validates the PR, approval trail and patch', async () => {
  const github = reviewGithub({ comments: [specificationComment, approvalComment] })
  const prepared = await prepareFeatureReview({
    github,
    context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
    pullRequestNumber: 17,
    template: '# Mission',
  })

  assert.equal(prepared.issueNumber, 12)
  assert.equal(prepared.headSha, headSha)
  assert.deepEqual(prepared.changedPaths, ['pages/recap/[id].vue'])
  assert.match(prepared.prompt, /Afficher la progression/)

  await assert.rejects(
    prepareFeatureReview({
      github: reviewGithub({
        currentPullRequest: {
          ...pullRequest,
          head: { ...pullRequest.head, repo: { full_name: 'outside/fork' } },
        },
        comments: [specificationComment, approvalComment],
      }),
      context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
      pullRequestNumber: 17,
      template: '# Mission',
    }),
    /trusted repository/,
  )

  await assert.rejects(
    prepareFeatureReview({
      github: reviewGithub({ comments: [specificationComment] }),
      context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
      pullRequestNumber: 17,
      template: '# Mission',
    }),
    /approval trail/,
  )
})

test('structured review results enforce verdict invariants', () => {
  const approved = parseFeatureReviewResult(JSON.stringify(approvedResult))
  assert.equal(approved.verdict, 'approved')
  assert.equal(approved.verificationSteps.length, 1)

  const changes = parseFeatureReviewResult(JSON.stringify({
    ...approvedResult,
    verdict: 'changes_requested',
    findings: [{
      severity: 'high',
      path: 'pages/recap/[id].vue',
      line: 42,
      title: 'Progression incorrecte',
      details: 'La valeur dépasse 100.',
      recommendation: 'Borner la valeur entre 0 et 100.',
    }],
    strengths: [],
  }))
  assert.equal(changes.findings[0].severity, 'high')

  assert.throws(() => parseFeatureReviewResult(JSON.stringify({
    ...approvedResult,
    verdict: 'changes_requested',
  })), /at least one finding/)
  assert.throws(() => parseFeatureReviewResult(JSON.stringify({
    ...approvedResult,
    verdict: 'blocked',
  })), /blockers and no findings/)
})

test('review comments render findings and prevent live mentions', () => {
  const comment = buildReviewComment({
    verdict: 'changes_requested',
    summary: 'Prévenir @product avant fusion.',
    findings: [{
      severity: 'medium',
      path: 'pages/recap/[id].vue',
      line: 42,
      title: 'Libellé manquant',
      details: 'Le contrôle ne possède pas de nom accessible.',
      recommendation: 'Ajouter un aria-label.',
    }],
    strengths: [],
    verificationSteps: [],
    blockers: [],
  }, headSha)

  assert.match(comment, /Corrections demandées/)
  assert.match(comment, /pages\/recap\/\[id\]\.vue:42/)
  assert.equal(comment.includes('@product'), false)
  assert.equal(comment.includes('@\u200bproduct'), true)
  assert.match(comment, new RegExp(headSha.slice(0, 12)))
})

test('publishing revalidates the SHA and updates reusable labels and comment', async () => {
  const addedLabels = []
  const removedLabels = []
  const createdLabels = []
  const comments = []
  const outputs = new Map()
  const github = reviewGithub()
  github.rest.issues.getLabel = async () => notFound()
  github.rest.issues.createLabel = async ({ name }) => createdLabels.push(name)
  github.rest.issues.addLabels = async ({ issue_number: issueNumber, labels }) => {
    addedLabels.push({ issueNumber, labels })
  }
  github.rest.issues.removeLabel = async ({ issue_number: issueNumber, name }) => {
    removedLabels.push({ issueNumber, name })
  }
  github.rest.issues.createComment = async ({ body }) => comments.push(body)
  github.rest.issues.updateComment = async () => {}
  github.paginate = async (_method, options) => options.issue_number === 17 ? [] : []

  await publishFeatureReview({
    github,
    context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
    core: {
      info: () => {},
      setOutput: (name, value) => outputs.set(name, value),
    },
    pullRequestNumber: 17,
    expectedHeadSha: headSha,
    rawResult: JSON.stringify(approvedResult),
  })

  assert.deepEqual(createdLabels.sort(), [
    'ai:review-blocked',
    'ai:review-changes',
    'ai:review-passed',
  ])
  assert.deepEqual(addedLabels, [
    { issueNumber: 17, labels: ['ai:review-passed'] },
    { issueNumber: 12, labels: ['ai:review-passed'] },
  ])
  assert.deepEqual(removedLabels, [])
  assert.equal(comments.length, 1)
  assert.equal(outputs.get('review-verdict'), 'approved')

  await assert.rejects(
    publishFeatureReview({
      github,
      context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
      core: { info: () => {}, setOutput: () => {} },
      pullRequestNumber: 17,
      expectedHeadSha: 'c'.repeat(40),
      rawResult: JSON.stringify(approvedResult),
    }),
    /changed during the review/,
  )
})
