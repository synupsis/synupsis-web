import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPreviewApprovalComment,
  handlePreviewApproval,
  isPreviewApprovalCommand,
  mergeAcceptedPreview,
  previewApprovalHeadMarker,
  verifyPreviewChecks,
} from './feature-preview-acceptance.mjs'
import {
  reviewHeadMarker,
  reviewVerdictMarker,
} from './feature-review.mjs'

const headSha = 'a'.repeat(40)
const mergeSha = 'c'.repeat(40)
const previewUrl = 'https://deploy-preview-17--dev-synupsis.netlify.app/'

const pullRequest = {
  number: 17,
  node_id: 'PR_kwDOExample',
  state: 'open',
  draft: true,
  title: 'AI #12: Ajouter une barre de progression',
  html_url: 'https://github.com/synupsis/synupsis-web/pull/17',
  labels: [{ name: 'ai:review-passed' }],
  head: {
    ref: 'codex/issue-12',
    sha: headSha,
    repo: { full_name: 'synupsis/synupsis-web' },
  },
  base: { ref: 'develop' },
}

const issue = {
  number: 12,
  author_association: 'MEMBER',
  labels: [
    { name: 'ai:spec-approved' },
    { name: 'ai:implementation-pr' },
    { name: 'ai:review-passed' },
  ],
}

const approvedReviewComment = {
  user: { type: 'Bot' },
  created_at: '2026-07-20T10:00:00Z',
  body: [
    '<!-- synupsis-ai-review:v1 -->',
    reviewHeadMarker(headSha),
    reviewVerdictMarker('approved'),
    'Review approuvée.',
  ].join('\n'),
}

const previewApprovalComment = {
  user: { type: 'Bot' },
  created_at: '2026-07-20T10:05:00Z',
  body: [
    '<!-- synupsis-ai-preview-approval:v1 -->',
    previewApprovalHeadMarker(headSha),
    'Preview approuvée.',
  ].join('\n'),
}

function successfulCheckRuns() {
  return [{
    name: 'Lint, typecheck and build',
    status: 'completed',
    conclusion: 'success',
    details_url: 'https://github.com/synupsis/synupsis-web/actions/runs/1',
    completed_at: '2026-07-20T10:00:00Z',
    app: { slug: 'github-actions' },
  }]
}

function successfulStatuses(targetUrl = previewUrl) {
  return [{
    context: 'netlify/dev-synupsis/deploy-preview',
    state: 'success',
    target_url: targetUrl,
    updated_at: '2026-07-20T10:01:00Z',
  }]
}

function acceptanceGithub({
  currentPullRequest = pullRequest,
  currentIssue = issue,
  comments = [approvedReviewComment],
  checkRuns = successfulCheckRuns(),
  statuses = successfulStatuses(),
} = {}) {
  const calls = {
    addedLabels: [],
    comments: [],
    dispatches: [],
    deletedRefs: [],
    graphql: [],
    merges: [],
    updates: [],
  }
  const github = {
    rest: {
      actions: {
        createWorkflowDispatch: async (input) => calls.dispatches.push(input),
      },
      checks: {
        listForRef: async () => ({ data: { check_runs: checkRuns } }),
      },
      git: {
        deleteRef: async (input) => calls.deletedRefs.push(input),
      },
      issues: {
        addLabels: async (input) => calls.addedLabels.push(input),
        createComment: async (input) => calls.comments.push(input),
        createLabel: async () => {},
        get: async ({ issue_number: issueNumber }) => {
          assert.equal(issueNumber, 12)
          return { data: currentIssue }
        },
        getLabel: async () => ({ data: {} }),
        listComments: async () => {},
        update: async (input) => calls.updates.push(input),
      },
      pulls: {
        get: async () => ({ data: currentPullRequest }),
        merge: async (input) => {
          calls.merges.push(input)
          return { data: { merged: true, sha: mergeSha } }
        },
      },
      repos: {
        getCombinedStatusForRef: async () => ({ data: { statuses } }),
      },
    },
    graphql: async (...input) => calls.graphql.push(input),
    paginate: async () => comments,
  }
  return { calls, github }
}

function coreRecorder() {
  const outputs = new Map()
  return {
    outputs,
    core: {
      info: () => {},
      warning: () => {},
      setOutput: (name, value) => outputs.set(name, value),
    },
  }
}

function issueCommentContext({ association = 'MEMBER', body = '/approve-preview' } = {}) {
  return {
    repo: { owner: 'synupsis', repo: 'synupsis-web' },
    payload: {
      issue: { number: 17, pull_request: {} },
      comment: { body, author_association: association },
    },
  }
}

test('preview acceptance requires the exact public command', () => {
  assert.equal(isPreviewApprovalCommand('/approve-preview'), true)
  assert.equal(isPreviewApprovalCommand('/approve-preview '), false)
  assert.equal(isPreviewApprovalCommand('please /approve-preview'), false)
})

test('preview verification requires current successful CI and the exact Netlify preview', async () => {
  const { github } = acceptanceGithub()
  const checks = await verifyPreviewChecks({
    github,
    owner: 'synupsis',
    repo: 'synupsis-web',
    pullRequest,
  })
  assert.equal(checks.previewUrl, previewUrl)

  const failingCi = acceptanceGithub({
    checkRuns: successfulCheckRuns().map((checkRun) => ({
      ...checkRun,
      conclusion: 'failure',
    })),
  })
  await assert.rejects(
    verifyPreviewChecks({
      github: failingCi.github,
      owner: 'synupsis',
      repo: 'synupsis-web',
      pullRequest,
    }),
    /successful current CI check/,
  )

  const wrongPreview = acceptanceGithub({
    statuses: successfulStatuses('https://deploy-preview-18--dev-synupsis.netlify.app/'),
  })
  await assert.rejects(
    verifyPreviewChecks({
      github: wrongPreview.github,
      owner: 'synupsis',
      repo: 'synupsis-web',
      pullRequest,
    }),
    /Unexpected Netlify preview URL/,
  )
})

test('untrusted preview approvals are rejected before repository writes', async () => {
  const { calls, github } = acceptanceGithub()
  const { core, outputs } = coreRecorder()
  await handlePreviewApproval({
    github,
    context: issueCommentContext({ association: 'NONE' }),
    core,
  })

  assert.equal(outputs.get('approval_status'), 'rejected')
  assert.equal(calls.addedLabels.length, 0)
  assert.equal(calls.comments.length, 0)
})

test('a valid preview approval is tied to the current SHA and recorded on PR and Issue', async () => {
  const { calls, github } = acceptanceGithub()
  const { core, outputs } = coreRecorder()
  await handlePreviewApproval({
    github,
    context: issueCommentContext(),
    core,
  })

  assert.equal(outputs.get('approval_status'), 'ai:preview-approved')
  assert.equal(outputs.get('pull_request_number'), '17')
  assert.equal(outputs.get('issue_number'), '12')
  assert.equal(outputs.get('head_sha'), headSha)
  assert.equal(outputs.get('preview_url'), previewUrl)
  assert.deepEqual(calls.addedLabels.map((call) => call.issue_number), [17, 12])
  assert.equal(calls.comments.length, 1)
  assert.match(calls.comments[0].body, new RegExp(previewApprovalHeadMarker(headSha)))
  assert.match(calls.comments[0].body, /ne déploie pas en production/)
})

test('preview approval refuses a stale or non-approved AI review', async () => {
  const staleReview = {
    ...approvedReviewComment,
    body: approvedReviewComment.body.replace(headSha, 'b'.repeat(40)),
  }
  const { github } = acceptanceGithub({ comments: [staleReview] })
  const { core } = coreRecorder()

  await assert.rejects(
    handlePreviewApproval({ github, context: issueCommentContext(), core }),
    /no approved review tied to its current head SHA/,
  )
})

test('accepted previews are squash-merged into develop and explicitly restart CI', async () => {
  const { calls, github } = acceptanceGithub({
    comments: [approvedReviewComment, previewApprovalComment],
  })
  const { core, outputs } = coreRecorder()
  await mergeAcceptedPreview({
    github,
    context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
    core,
    pullRequestNumber: 17,
    expectedHeadSha: headSha,
  })

  assert.equal(calls.graphql.length, 1)
  assert.equal(calls.merges.length, 1)
  assert.equal(calls.merges[0].sha, headSha)
  assert.equal(calls.merges[0].merge_method, 'squash')
  assert.match(calls.merges[0].commit_title, /\(#17\)$/)
  assert.deepEqual(calls.deletedRefs.map((call) => call.ref), ['heads/codex/issue-12'])
  assert.deepEqual(calls.dispatches, [{
    owner: 'synupsis',
    repo: 'synupsis-web',
    workflow_id: 'ci.yml',
    ref: 'develop',
  }])
  assert.equal(calls.updates[0].state, 'closed')
  assert.equal(calls.updates[0].state_reason, 'completed')
  assert.match(calls.comments.at(-1).body, /ne constitue pas une mise en production/)
  assert.equal(outputs.get('integration_status'), 'ai:integrated-dev')
  assert.equal(outputs.get('merge_sha'), mergeSha)
})

test('the merge revalidates that the implementation head did not change', async () => {
  const { github } = acceptanceGithub({
    comments: [approvedReviewComment, previewApprovalComment],
  })
  const { core } = coreRecorder()

  await assert.rejects(
    mergeAcceptedPreview({
      github,
      context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
      core,
      pullRequestNumber: 17,
      expectedHeadSha: 'b'.repeat(40),
    }),
    /changed during preview acceptance/,
  )
})

test('preview approval comments make the development-only boundary explicit', () => {
  const comment = buildPreviewApprovalComment({ headSha, previewUrl })
  assert.match(comment, /fusionnée par squash dans `develop`/)
  assert.match(comment, /ne déploie pas en production/)
})
