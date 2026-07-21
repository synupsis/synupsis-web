import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildReleaseApprovalComment,
  buildReleaseMetadataComment,
  handleProductionApproval,
  handleProductionPreparation,
  isApproveProductionCommand,
  isPrepareProductionCommand,
  mergeApprovedProduction,
  releaseBaseMarker,
  releaseHeadMarker,
  verifyReleaseChecks,
} from './production-release.mjs'

const headSha = 'a'.repeat(40)
const baseSha = 'b'.repeat(40)
const mergeSha = 'c'.repeat(40)
const controlIssueNumber = 42
const releaseBranch = 'release/20260721-120000-aaaaaaaaaaaa'

const releasePullRequest = {
  number: 31,
  node_id: 'PR_kwDORelease',
  state: 'open',
  draft: true,
  mergeable: true,
  mergeable_state: 'clean',
  title: 'Release production 2026-07-21',
  html_url: 'https://github.com/synupsis/synupsis-web/pull/31',
  labels: [{ name: 'ai:release-candidate' }],
  head: {
    ref: releaseBranch,
    sha: headSha,
    repo: { full_name: 'synupsis/synupsis-web' },
  },
  base: { ref: 'main' },
}

const releaseControlIssue = {
  number: controlIssueNumber,
  state: 'open',
  author_association: 'OWNER',
  labels: [{ name: 'ai:release-control' }],
}

const metadataComment = {
  user: { type: 'Bot', login: 'github-actions[bot]' },
  created_at: '2026-07-21T12:00:00Z',
  body: buildReleaseMetadataComment({ controlIssueNumber, baseSha, headSha }),
}

const approvalComment = {
  user: { type: 'Bot', login: 'github-actions[bot]' },
  created_at: '2026-07-21T12:05:00Z',
  body: buildReleaseApprovalComment({ headSha, baseSha }),
}

function successfulCheckRuns() {
  return [{
    name: 'Lint, typecheck and build',
    status: 'completed',
    conclusion: 'success',
    details_url: 'https://github.com/synupsis/synupsis-web/actions/runs/100',
    completed_at: '2026-07-21T12:03:00Z',
    app: { slug: 'github-actions' },
  }]
}

function successfulWorkflowRuns() {
  return [{
    name: 'CI',
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
    head_sha: headSha,
    head_branch: releaseBranch,
    html_url: 'https://github.com/synupsis/synupsis-web/actions/runs/100',
    updated_at: '2026-07-21T12:03:00Z',
  }]
}

function compareResult() {
  return {
    status: 'ahead',
    ahead_by: 2,
    commits: [
      { sha: 'd'.repeat(40), commit: { message: 'feat: add first release change' } },
      { sha: headSha, commit: { message: 'fix: complete the release\n\nDetails' } },
    ],
    files: [
      { filename: 'app/pages/index.vue' },
      { filename: 'supabase/migrations/20260721120000_add_release.sql' },
    ],
  }
}

function productionGithub({
  currentPullRequest = releasePullRequest,
  currentControlIssue = releaseControlIssue,
  comments = [metadataComment],
  checkRuns = successfulCheckRuns(),
  workflowRuns = successfulWorkflowRuns(),
  mainSha = baseSha,
  developSha = headSha,
  openPullRequests = [],
  compare = compareResult(),
} = {}) {
  const calls = {
    addedLabels: [],
    comments: [],
    createdPullRequests: [],
    createdRefs: [],
    deletedRefs: [],
    dispatches: [],
    graphql: [],
    merges: [],
  }

  const github = {
    rest: {
      actions: {
        createWorkflowDispatch: async (input) => calls.dispatches.push(input),
        listWorkflowRunsForRepo: async () => ({ data: { workflow_runs: workflowRuns } }),
      },
      checks: {
        listForRef: async () => ({ data: { check_runs: checkRuns } }),
      },
      git: {
        createRef: async (input) => calls.createdRefs.push(input),
        deleteRef: async (input) => calls.deletedRefs.push(input),
        getRef: async ({ ref }) => ({
          data: { object: { sha: ref === 'heads/develop' ? developSha : mainSha } },
        }),
      },
      issues: {
        addLabels: async (input) => calls.addedLabels.push(input),
        createComment: async (input) => calls.comments.push(input),
        createLabel: async () => {},
        get: async ({ issue_number: issueNumber }) => {
          assert.equal(issueNumber, controlIssueNumber)
          return { data: currentControlIssue }
        },
        getLabel: async () => ({ data: {} }),
        listComments: async () => {},
      },
      pulls: {
        create: async (input) => {
          calls.createdPullRequests.push(input)
          return {
            data: {
              ...releasePullRequest,
              head: { ...releasePullRequest.head, ref: input.head },
            },
          }
        },
        get: async () => ({ data: currentPullRequest }),
        list: async () => ({ data: openPullRequests }),
        merge: async (input) => {
          calls.merges.push(input)
          return { data: { merged: true, sha: mergeSha } }
        },
      },
      repos: {
        compareCommitsWithBasehead: async () => ({ data: compare }),
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

function preparationContext({ association = 'MEMBER', body = '/prepare-production' } = {}) {
  return {
    repo: { owner: 'synupsis', repo: 'synupsis-web' },
    payload: {
      issue: { number: controlIssueNumber },
      comment: { body, author_association: association },
    },
  }
}

function approvalContext({ association = 'MEMBER', body = '/approve-production' } = {}) {
  return {
    repo: { owner: 'synupsis', repo: 'synupsis-web' },
    payload: {
      issue: { number: releasePullRequest.number, pull_request: {} },
      comment: { body, author_association: association },
    },
  }
}

test('production commands must match exactly', () => {
  assert.equal(isPrepareProductionCommand('/prepare-production'), true)
  assert.equal(isPrepareProductionCommand('/prepare-production '), false)
  assert.equal(isPrepareProductionCommand('please /prepare-production'), false)
  assert.equal(isApproveProductionCommand('/approve-production'), true)
  assert.equal(isApproveProductionCommand('/approve-production\n'), false)
})

test('preparation freezes develop, opens a draft PR and dispatches release CI', async () => {
  const { calls, github } = productionGithub()
  const { core, outputs } = coreRecorder()
  await handleProductionPreparation({
    github,
    context: preparationContext(),
    core,
    now: new Date('2026-07-21T12:00:00.000Z'),
  })

  assert.deepEqual(calls.createdRefs, [{
    owner: 'synupsis',
    repo: 'synupsis-web',
    ref: `refs/heads/${releaseBranch}`,
    sha: headSha,
  }])
  assert.equal(calls.createdPullRequests.length, 1)
  assert.equal(calls.createdPullRequests[0].base, 'main')
  assert.equal(calls.createdPullRequests[0].head, releaseBranch)
  assert.equal(calls.createdPullRequests[0].draft, true)
  assert.match(calls.createdPullRequests[0].body, new RegExp(releaseHeadMarker(headSha)))
  assert.match(calls.createdPullRequests[0].body, new RegExp(releaseBaseMarker(baseSha)))
  assert.deepEqual(calls.addedLabels[0].labels, [
    'ai:release-candidate',
    'ai:release-db-changes',
  ])
  assert.deepEqual(calls.dispatches, [{
    owner: 'synupsis',
    repo: 'synupsis-web',
    workflow_id: 'ci.yml',
    ref: releaseBranch,
  }])
  assert.equal(outputs.get('preparation_status'), 'ai:release-candidate')
  assert.equal(outputs.get('head_sha'), headSha)
  assert.equal(outputs.get('base_sha'), baseSha)
})

test('untrusted preparation is rejected before repository writes', async () => {
  const { calls, github } = productionGithub()
  const { core, outputs } = coreRecorder()
  await handleProductionPreparation({
    github,
    context: preparationContext({ association: 'NONE' }),
    core,
  })

  assert.equal(outputs.get('preparation_status'), 'rejected')
  assert.equal(calls.createdRefs.length, 0)
  assert.equal(calls.createdPullRequests.length, 0)
})

test('release checks require a successful run on the exact immutable branch', async () => {
  const { github } = productionGithub()
  const checks = await verifyReleaseChecks({
    github,
    owner: 'synupsis',
    repo: 'synupsis-web',
    pullRequest: releasePullRequest,
  })
  assert.match(checks.workflowUrl, /actions\/runs\/100/)

  const wrongBranch = productionGithub({
    workflowRuns: successfulWorkflowRuns().map((run) => ({
      ...run,
      head_branch: 'develop',
    })),
  })
  await assert.rejects(
    verifyReleaseChecks({
      github: wrongBranch.github,
      owner: 'synupsis',
      repo: 'synupsis-web',
      pullRequest: releasePullRequest,
    }),
    /successful CI workflow run for its release branch/,
  )
})

test('approval is bound to trusted metadata, current main and current release SHA', async () => {
  const { calls, github } = productionGithub()
  const { core, outputs } = coreRecorder()
  await handleProductionApproval({ github, context: approvalContext(), core })

  assert.equal(outputs.get('approval_status'), 'ai:release-approved')
  assert.equal(outputs.get('pull_request_number'), '31')
  assert.equal(outputs.get('head_sha'), headSha)
  assert.equal(outputs.get('base_sha'), baseSha)
  assert.deepEqual(calls.addedLabels[0].labels, ['ai:release-approved'])
  assert.match(calls.comments[0].body, new RegExp(releaseHeadMarker(headSha)))
  assert.match(calls.comments[0].body, new RegExp(releaseBaseMarker(baseSha)))

  const staleMain = productionGithub({ mainSha: 'e'.repeat(40) })
  await assert.rejects(
    handleProductionApproval({
      github: staleMain.github,
      context: approvalContext(),
      core,
    }),
    /main changed after Pull Request/,
  )
})

test('metadata from an arbitrary bot cannot authorize a production release', async () => {
  const untrustedMetadata = {
    ...metadataComment,
    user: { type: 'Bot', login: 'some-app[bot]' },
  }
  const { github } = productionGithub({ comments: [untrustedMetadata] })
  const { core } = coreRecorder()
  await assert.rejects(
    handleProductionApproval({ github, context: approvalContext(), core }),
    /no trusted release metadata/,
  )
})

test('approved production uses a merge commit and revalidates all immutable values', async () => {
  const { calls, github } = productionGithub({ comments: [metadataComment, approvalComment] })
  const { core, outputs } = coreRecorder()
  await mergeApprovedProduction({
    github,
    context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
    core,
    pullRequestNumber: releasePullRequest.number,
    expectedHeadSha: headSha,
    expectedBaseSha: baseSha,
  })

  assert.equal(calls.graphql.length, 1)
  assert.equal(calls.merges.length, 1)
  assert.equal(calls.merges[0].sha, headSha)
  assert.equal(calls.merges[0].merge_method, 'merge')
  assert.deepEqual(calls.deletedRefs.map((call) => call.ref), [`heads/${releaseBranch}`])
  assert.equal(outputs.get('promotion_status'), 'ai:production-promoted')
  assert.equal(outputs.get('merge_sha'), mergeSha)
  assert.match(calls.comments.at(-1).body, /Vérifier maintenant les déploiements/)
})

test('merge refuses a release whose recorded approval no longer matches', async () => {
  const { github } = productionGithub({ comments: [metadataComment, approvalComment] })
  const { core } = coreRecorder()
  await assert.rejects(
    mergeApprovedProduction({
      github,
      context: { repo: { owner: 'synupsis', repo: 'synupsis-web' } },
      core,
      pullRequestNumber: releasePullRequest.number,
      expectedHeadSha: 'f'.repeat(40),
      expectedBaseSha: baseSha,
    }),
    /changed during production approval/,
  )
})
