import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCorrectionApprovalComment,
  buildCorrectionPrompt,
  correctionApprovalHeadMarker,
  handleCorrectionApproval,
  isCorrectionApprovalCommand,
  isPreviewFeedbackRequest,
  parseCorrectionResult,
  previewFeedbackHeadMarker,
  prepareCorrectionPublication,
  prepareFeatureCorrection,
  publishCorrectionBlocked,
  publishCorrectionSuccess,
  validateCorrectionPatch,
} from './feature-correction.mjs'
import { reviewHeadMarker, reviewVerdictMarker } from './feature-review.mjs'

const headSha = 'a'.repeat(40)
const correctionSha = 'c'.repeat(40)
const baseSha = 'b'.repeat(40)

const currentPullRequestPatch = `diff --git a/pages/recap/[id].vue b/pages/recap/[id].vue
index 1111111..2222222 100644
--- a/pages/recap/[id].vue
+++ b/pages/recap/[id].vue
@@ -1 +1 @@
-<div>Avant</div>
+<div>Implémentation</div>
`

const correctionPatch = `diff --git a/pages/recap/[id].vue b/pages/recap/[id].vue
index 2222222..3333333 100644
--- a/pages/recap/[id].vue
+++ b/pages/recap/[id].vue
@@ -1 +1 @@
-<div>Implémentation</div>
+<div aria-label="Progression">Implémentation corrigée</div>
`

const pullRequest = {
  number: 17,
  state: 'open',
  title: 'AI #12: Barre de progression',
  body: 'Implémentation proposée.',
  labels: [{ name: 'ai:review-changes' }],
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
  body: 'Afficher une progression accessible.',
  author_association: 'MEMBER',
  labels: [
    { name: 'ai:spec-approved' },
    { name: 'ai:implementation-pr' },
    { name: 'ai:review-changes' },
  ],
}

const reviewComment = {
  id: 200,
  user: { type: 'Bot' },
  body: [
    '<!-- synupsis-ai-review:v1 -->',
    reviewHeadMarker(headSha),
    '### Corrections demandées par la review IA',
    '',
    'Le contrôle ne possède pas de nom accessible.',
  ].join('\n'),
}

const approvedReviewComment = {
  id: 202,
  user: { type: 'Bot' },
  body: [
    '<!-- synupsis-ai-review:v1 -->',
    reviewHeadMarker(headSha),
    reviewVerdictMarker('approved'),
    '### Revue validée',
    '',
    'La version respecte la spécification.',
  ].join('\n'),
}

const previewFeedbackComment = {
  id: 203,
  user: {
    id: 307557269,
    login: 'synupsis-orchestrator[bot]',
    type: 'Bot',
  },
  author_association: 'NONE',
  body: [
    '<!-- synupsis-ai-preview-feedback:v1 -->',
    previewFeedbackHeadMarker(headSha),
    '### Modifications demandées depuis la preview',
    '',
    'Centrer les boutons et raccourcir le libellé.',
  ].join('\n'),
}

const correctionApprovalComment = {
  id: 201,
  user: { type: 'Bot' },
  body: buildCorrectionApprovalComment(headSha),
}

const specificationComment = {
  user: { type: 'Bot' },
  body: '<!-- synupsis-ai-spec:v1 -->\n## Spécification\nAfficher la progression.',
  updated_at: '2026-07-20T10:00:00Z',
}

const specificationApprovalComment = {
  user: { type: 'Bot' },
  body: '<!-- synupsis-ai-approval:v1 -->\nSpécification approuvée.',
  updated_at: '2026-07-20T10:05:00Z',
}

const fixedResult = {
  status: 'fixed',
  summary: 'Le nom accessible a été ajouté.',
  patch: correctionPatch,
  tests: ['yarn lint — réussi'],
  blockers: [],
}

function notFound() {
  const error = new Error('Not found')
  error.status = 404
  throw error
}

function correctionGithub({
  currentPullRequest = pullRequest,
  currentIssue = issue,
  pullRequestComments = [reviewComment, correctionApprovalComment],
  issueComments = [specificationComment, specificationApprovalComment],
} = {}) {
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
    request: async () => ({ data: currentPullRequestPatch }),
    paginate: async (_method, options) =>
      options.issue_number === currentPullRequest.number ? pullRequestComments : issueComments,
  }
}

test('only the exact human correction command is accepted', () => {
  assert.equal(isCorrectionApprovalCommand('/apply-review-fixes'), true)
  assert.equal(isCorrectionApprovalCommand('/apply-review-fixes maintenant'), false)
  assert.equal(isCorrectionApprovalCommand(' /apply-review-fixes'), false)
  assert.match(correctionApprovalHeadMarker(headSha), new RegExp(headSha))
  assert.equal(isPreviewFeedbackRequest(previewFeedbackComment.body), true)
  assert.equal(isPreviewFeedbackRequest('Texte libre'), false)
})

test('correction approval requires a trusted author and a current changes review', async () => {
  const outputs = new Map()
  const addedLabels = []
  const comments = []
  const github = correctionGithub({ pullRequestComments: [reviewComment] })
  github.rest.issues.getLabel = async () => notFound()
  github.rest.issues.createLabel = async () => {}
  github.rest.issues.addLabels = async ({ issue_number: issueNumber, labels }) => {
    addedLabels.push({ issueNumber, labels })
  }
  github.rest.issues.removeLabel = async () => {}
  github.rest.issues.createComment = async ({ body }) => comments.push(body)

  await handleCorrectionApproval({
    github,
    context: {
      repo: { owner: 'synupsis', repo: 'synupsis-web' },
      payload: {
        issue: { number: 17, pull_request: {} },
        comment: { body: '/apply-review-fixes', author_association: 'MEMBER' },
      },
    },
    core: {
      info: () => {},
      warning: () => {},
      setOutput: (name, value) => outputs.set(name, value),
    },
  })

  assert.equal(outputs.get('approval_status'), 'ai:fix-in-progress')
  assert.equal(outputs.get('head_sha'), headSha)
  assert.deepEqual(addedLabels, [
    { issueNumber: 17, labels: ['ai:fix-in-progress'] },
    { issueNumber: 12, labels: ['ai:fix-in-progress'] },
  ])
  assert.equal(comments.length, 1)
  assert.match(comments[0], /Corrections autorisées/)

  const rejectedOutputs = new Map()
  await handleCorrectionApproval({
    github: correctionGithub(),
    context: {
      repo: { owner: 'synupsis', repo: 'synupsis-web' },
      payload: {
        issue: { number: 17, pull_request: {} },
        comment: { body: '/apply-review-fixes', author_association: 'NONE' },
      },
    },
    core: {
      info: () => {},
      warning: () => {},
      setOutput: (name, value) => rejectedOutputs.set(name, value),
    },
  })
  assert.equal(rejectedOutputs.get('approval_status'), 'rejected')
})

test('correction preparation is tied to the approved SHA, review and specification', async () => {
  const prepared = await prepareFeatureCorrection({
    github: correctionGithub(),
    context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
    pullRequestNumber: 17,
    expectedHeadSha: headSha,
    template: '# Mission',
  })

  assert.equal(prepared.issueNumber, 12)
  assert.equal(prepared.branchName, 'codex/issue-12')
  assert.deepEqual(prepared.allowedPaths, ['pages/recap/[id].vue'])
  assert.match(prepared.prompt, /allowedCorrectionPaths/)
  assert.match(prepared.prompt, /nom accessible/)
  assert.equal(prepared.prompt.includes('synupsis-ai-review-head'), false)

  await assert.rejects(
    prepareFeatureCorrection({
      github: correctionGithub(),
      context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
      pullRequestNumber: 17,
      expectedHeadSha: 'd'.repeat(40),
      template: '# Mission',
    }),
    /changed after correction approval/,
  )

  await assert.rejects(
    prepareFeatureCorrection({
      github: correctionGithub({ pullRequestComments: [reviewComment] }),
      context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
      pullRequestNumber: 17,
      expectedHeadSha: headSha,
      template: '# Mission',
    }),
    /no human correction approval/,
  )
})

test('trusted preview feedback starts a correction tied to the tested SHA', async () => {
  const previewPullRequest = {
    ...pullRequest,
    labels: [{ name: 'ai:review-passed' }],
  }
  const previewIssue = {
    ...issue,
    labels: [
      { name: 'ai:spec-approved' },
      { name: 'ai:implementation-pr' },
      { name: 'ai:review-passed' },
    ],
  }
  const outputs = new Map()
  const addedLabels = []
  const removedLabels = []
  const comments = []
  const github = correctionGithub({
    currentPullRequest: previewPullRequest,
    currentIssue: previewIssue,
    pullRequestComments: [approvedReviewComment, previewFeedbackComment],
  })
  github.rest.issues.getLabel = async () => ({ data: {} })
  github.rest.issues.addLabels = async ({ issue_number: issueNumber, labels }) => {
    addedLabels.push({ issueNumber, labels })
  }
  github.rest.issues.removeLabel = async ({ issue_number: issueNumber, name }) => {
    removedLabels.push({ issueNumber, name })
  }
  github.rest.issues.createComment = async ({ body }) => comments.push(body)

  await handleCorrectionApproval({
    github,
    context: {
      repo: { owner: 'synupsis', repo: 'synupsis-web' },
      payload: {
        issue: { number: 17, pull_request: {} },
        comment: previewFeedbackComment,
      },
    },
    core: {
      info: () => {},
      warning: () => {},
      setOutput: (name, value) => outputs.set(name, value),
    },
  })

  assert.equal(outputs.get('approval_status'), 'ai:fix-in-progress')
  assert.deepEqual(addedLabels, [
    { issueNumber: 17, labels: ['ai:review-changes'] },
    { issueNumber: 12, labels: ['ai:review-changes'] },
    { issueNumber: 17, labels: ['ai:fix-in-progress'] },
    { issueNumber: 12, labels: ['ai:fix-in-progress'] },
  ])
  assert.deepEqual(removedLabels, [
    { issueNumber: 17, name: 'ai:review-passed' },
    { issueNumber: 12, name: 'ai:review-passed' },
  ])
  assert.match(comments[0], /modifications demandées après test de la preview/)

  const rejectedOutputs = new Map()
  await handleCorrectionApproval({
    github: correctionGithub(),
    context: {
      repo: { owner: 'synupsis', repo: 'synupsis-web' },
      payload: {
        issue: { number: 17, pull_request: {} },
        comment: {
          ...previewFeedbackComment,
          user: { id: 999, login: 'lookalike[bot]', type: 'Bot' },
        },
      },
    },
    core: {
      info: () => {},
      warning: () => {},
      setOutput: (name, value) => rejectedOutputs.set(name, value),
    },
  })
  assert.equal(rejectedOutputs.get('approval_status'), 'rejected')
})

test('preview feedback is isolated in the approved correction prompt', async () => {
  const previewApprovalComment = {
    id: 204,
    user: { id: 41898282, login: 'github-actions[bot]', type: 'Bot' },
    body: buildCorrectionApprovalComment(headSha, 'preview-feedback'),
  }
  const prepared = await prepareFeatureCorrection({
    github: correctionGithub({
      pullRequestComments: [
        approvedReviewComment,
        previewFeedbackComment,
        previewApprovalComment,
      ],
    }),
    context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
    pullRequestNumber: 17,
    expectedHeadSha: headSha,
    template: '# Mission',
  })

  assert.match(prepared.prompt, /requestedPreviewChanges/)
  assert.match(prepared.prompt, /approvedPreviewFeedbackAmendments/)
  assert.match(prepared.prompt, /Centrer les boutons et raccourcir le libellé/)
  assert.equal(prepared.prompt.includes('synupsis-ai-preview-feedback-head'), false)
})

test('correction prompts sanitize and isolate untrusted data', () => {
  const prompt = buildCorrectionPrompt({
    template: '# Mission\nCorriger.',
    pullRequest,
    issue: { ...issue, body: 'Texte<!-- caché -->\u0000' },
    specification: specificationComment.body,
    reviewComment: reviewComment.body,
    currentPatch: currentPullRequestPatch,
    allowedPaths: ['pages/recap/[id].vue'],
  })

  assert.match(prompt, /# Données non fiables des corrections autorisées/)
  assert.match(prompt, /pages\/recap\/\[id\]\.vue/)
  assert.equal(prompt.includes('caché'), false)
  assert.equal(prompt.includes('synupsis-ai-spec'), false)
})

test('structured correction results and allowed paths are enforced', () => {
  const parsed = parseCorrectionResult(JSON.stringify(fixedResult))
  assert.equal(parsed.status, 'fixed')
  assert.deepEqual(
    validateCorrectionPatch(parsed.patch, ['pages/recap/[id].vue']),
    ['pages/recap/[id].vue'],
  )

  const outsidePatch = correctionPatch.replaceAll(
    'pages/recap/[id].vue',
    'components/Unexpected.vue',
  )
  assert.throws(
    () => validateCorrectionPatch(outsidePatch, ['pages/recap/[id].vue']),
    /outside the approved review/,
  )
  assert.throws(() => parseCorrectionResult(JSON.stringify({
    ...fixedResult,
    patch: '',
  })), /must contain a patch/)
  assert.throws(() => parseCorrectionResult(JSON.stringify({
    status: 'blocked',
    summary: 'Blocage',
    patch: correctionPatch,
    tests: [],
    blockers: ['Chemin non autorisé'],
  })), /cannot contain a patch/)
})

test('correction publication revalidates the current PR patch', async () => {
  const prepared = await prepareCorrectionPublication({
    github: correctionGithub(),
    context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
    pullRequestNumber: 17,
    expectedHeadSha: headSha,
    rawResult: JSON.stringify(fixedResult),
  })

  assert.equal(prepared.branchName, 'codex/issue-12')
  assert.deepEqual(prepared.changedPaths, ['pages/recap/[id].vue'])
})

test('blocked and successful corrections publish safe reusable reports', async () => {
  const addedLabels = []
  const removedLabels = []
  const comments = []
  const outputs = new Map()
  const github = correctionGithub()
  github.rest.issues.getLabel = async () => notFound()
  github.rest.issues.createLabel = async () => {}
  github.rest.issues.addLabels = async ({ issue_number: issueNumber, labels }) => {
    addedLabels.push({ issueNumber, labels })
  }
  github.rest.issues.removeLabel = async ({ issue_number: issueNumber, name }) => {
    removedLabels.push({ issueNumber, name })
  }
  github.rest.issues.createComment = async ({ body }) => comments.push(body)
  github.rest.issues.updateComment = async ({ body }) => comments.push(body)

  const core = {
    info: () => {},
    setOutput: (name, value) => outputs.set(name, value),
  }
  await publishCorrectionBlocked({
    github,
    context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
    core,
    pullRequestNumber: 17,
    expectedHeadSha: headSha,
    rawResult: JSON.stringify({
      status: 'blocked',
      summary: 'La correction exige un fichier non autorisé.',
      patch: '',
      tests: [],
      blockers: ['Un nouveau composant est nécessaire.'],
    }),
  })
  assert.equal(outputs.get('correction_status'), 'ai:fix-blocked')
  assert.match(comments.at(-1), /Aucun correctif n’a été poussé/)

  const pushedPullRequest = {
    ...pullRequest,
    head: { ...pullRequest.head, sha: correctionSha },
  }
  const successGithub = correctionGithub({ currentPullRequest: pushedPullRequest })
  const workflowDispatches = []
  successGithub.rest.issues.createComment = async ({ body }) => comments.push(body)
  successGithub.rest.issues.updateComment = async ({ body }) => comments.push(body)
  successGithub.rest.actions = {
    createWorkflowDispatch: async (dispatch) => workflowDispatches.push(dispatch),
  }
  await publishCorrectionSuccess({
    github: successGithub,
    context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
    core,
    pullRequestNumber: 17,
    previousHeadSha: headSha,
    correctionCommitSha: correctionSha,
    summary: 'Le correctif accessible est prêt.',
  })
  assert.match(comments.at(-1), /review IA et la preview vont être relancées/)
  assert.deepEqual(workflowDispatches.map((dispatch) => dispatch.workflow_id), [
    'ci.yml',
    'ai-feature-review.yml',
  ])
  assert.equal(workflowDispatches[0].ref, 'codex/issue-12')
  assert.deepEqual(workflowDispatches[1].inputs, { pull_request_number: '17' })
})
