import { sanitizeProductText } from './feature-development.mjs'
import {
  issueNumberFromReviewBranch,
  reviewHeadMarker,
  reviewVerdictMarker,
} from './feature-review.mjs'

const PREVIEW_APPROVAL_COMMAND = '/approve-preview'
const REVIEW_COMMENT_MARKER = '<!-- synupsis-ai-review:v1 -->'
const PREVIEW_APPROVAL_MARKER = '<!-- synupsis-ai-preview-approval:v1 -->'
const INTEGRATION_COMMENT_MARKER = '<!-- synupsis-ai-integrated-dev:v1 -->'
const APPROVED_LABEL = 'ai:spec-approved'
const IMPLEMENTATION_LABEL = 'ai:implementation-pr'
const REVIEW_PASSED_LABEL = 'ai:review-passed'
const REVIEW_CHANGES_LABEL = 'ai:review-changes'
const REVIEW_BLOCKED_LABEL = 'ai:review-blocked'
const CORRECTION_IN_PROGRESS_LABEL = 'ai:fix-in-progress'
const CORRECTION_BLOCKED_LABEL = 'ai:fix-blocked'
const NETLIFY_STATUS_CONTEXT = 'netlify/dev-synupsis/deploy-preview'
const CI_CHECK_NAME = 'Lint, typecheck and build'
const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])

const ACCEPTANCE_LABELS = {
  approved: {
    name: 'ai:preview-approved',
    color: '1f883d',
    description: 'La Deploy Preview a été validée par un membre du dépôt',
  },
  integrated: {
    name: 'ai:integrated-dev',
    color: '8250df',
    description: 'La fonctionnalité validée est intégrée à l’environnement de développement',
  },
}

function normalizePositiveInteger(value, name) {
  const normalized = Number(value)
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error(`The ${name} input must be a positive integer.`)
  }
  return normalized
}

function validateHeadSha(value, name = 'head SHA') {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/i.test(value)) {
    throw new Error(`The ${name} is invalid.`)
  }
  return value.toLowerCase()
}

function labelsOf(item) {
  return new Set(
    (item.labels ?? [])
      .map((label) => typeof label === 'string' ? label : label.name)
      .filter(Boolean),
  )
}

function isTrustedAssociation(association = '') {
  return TRUSTED_ASSOCIATIONS.has(association.toUpperCase())
}

function neutralizeMentions(value) {
  return value.replaceAll('@', '@\u200b')
}

export function isPreviewApprovalCommand(body = '') {
  return body === PREVIEW_APPROVAL_COMMAND
}

export function previewApprovalHeadMarker(headSha) {
  return `<!-- synupsis-ai-preview-approval-head:${validateHeadSha(headSha)} -->`
}

function assertAcceptablePullRequest({ pullRequest, context }) {
  const expectedRepository = `${context.repo.owner}/${context.repo.repo}`
  if (pullRequest.state !== 'open') {
    throw new Error(`Pull Request #${pullRequest.number} is not open.`)
  }
  if (pullRequest.base?.ref !== 'develop') {
    throw new Error(`Pull Request #${pullRequest.number} does not target develop.`)
  }
  if (pullRequest.head?.repo?.full_name !== expectedRepository) {
    throw new Error(`Pull Request #${pullRequest.number} does not come from the trusted repository.`)
  }
  return issueNumberFromReviewBranch(pullRequest.head?.ref)
}

function assertAcceptedLabels({ pullRequest, issue, issueNumber }) {
  const pullRequestLabels = labelsOf(pullRequest)
  const issueLabels = labelsOf(issue)
  if (!isTrustedAssociation(issue.author_association)) {
    throw new Error(`#${issueNumber} was not created by a trusted repository member.`)
  }
  for (const requiredLabel of [APPROVED_LABEL, IMPLEMENTATION_LABEL, REVIEW_PASSED_LABEL]) {
    if (!issueLabels.has(requiredLabel)) {
      throw new Error(`#${issueNumber} is missing required label ${requiredLabel}.`)
    }
  }
  if (!pullRequestLabels.has(REVIEW_PASSED_LABEL)) {
    throw new Error(`Pull Request #${pullRequest.number} is not labelled ${REVIEW_PASSED_LABEL}.`)
  }
  const forbiddenLabels = [
    REVIEW_CHANGES_LABEL,
    REVIEW_BLOCKED_LABEL,
    CORRECTION_IN_PROGRESS_LABEL,
    CORRECTION_BLOCKED_LABEL,
  ]
  for (const forbiddenLabel of forbiddenLabels) {
    if (pullRequestLabels.has(forbiddenLabel) || issueLabels.has(forbiddenLabel)) {
      throw new Error(`The preview cannot be accepted while ${forbiddenLabel} is present.`)
    }
  }
  return { pullRequestLabels, issueLabels }
}

function latestByDate(items, dateFields) {
  return [...items].sort((left, right) => {
    const leftDate = dateFields.map((field) => Date.parse(left[field] ?? '')).find(Number.isFinite) ?? 0
    const rightDate = dateFields.map((field) => Date.parse(right[field] ?? '')).find(Number.isFinite) ?? 0
    return rightDate - leftDate
  })[0]
}

function validateNetlifyPreviewUrl(value, pullRequestNumber) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('The successful Netlify status does not contain a valid preview URL.')
  }
  const expectedHost = `deploy-preview-${pullRequestNumber}--dev-synupsis.netlify.app`
  if (url.protocol !== 'https:' || url.hostname !== expectedHost) {
    throw new Error(`Unexpected Netlify preview URL ${url.href}.`)
  }
  return url.href
}

export async function verifyPreviewChecks({ github, owner, repo, pullRequest }) {
  const checksResponse = await github.rest.checks.listForRef({
    owner,
    repo,
    ref: pullRequest.head.sha,
    per_page: 100,
  })
  const ciCheck = latestByDate(
    checksResponse.data.check_runs.filter((checkRun) =>
      checkRun.name === CI_CHECK_NAME && checkRun.app?.slug === 'github-actions',
    ),
    ['completed_at', 'started_at'],
  )
  if (!ciCheck || ciCheck.status !== 'completed' || ciCheck.conclusion !== 'success') {
    throw new Error(`Pull Request #${pullRequest.number} does not have a successful current CI check.`)
  }

  const statusResponse = await github.rest.repos.getCombinedStatusForRef({
    owner,
    repo,
    ref: pullRequest.head.sha,
    per_page: 100,
  })
  const netlifyStatus = latestByDate(
    statusResponse.data.statuses.filter((status) => status.context === NETLIFY_STATUS_CONTEXT),
    ['updated_at', 'created_at'],
  )
  if (!netlifyStatus || netlifyStatus.state !== 'success') {
    throw new Error(`Pull Request #${pullRequest.number} does not have a successful Netlify Deploy Preview.`)
  }

  return {
    ciUrl: ciCheck.details_url,
    previewUrl: validateNetlifyPreviewUrl(netlifyStatus.target_url, pullRequest.number),
  }
}

function findCurrentApprovedReview(comments, pullRequest) {
  const currentReview = comments.find((comment) =>
    comment.user?.type === 'Bot'
    && comment.body?.includes(REVIEW_COMMENT_MARKER)
    && comment.body?.includes(reviewHeadMarker(pullRequest.head.sha))
    && comment.body?.includes(reviewVerdictMarker('approved')),
  )
  if (!currentReview) {
    throw new Error(`Pull Request #${pullRequest.number} has no approved review tied to its current head SHA.`)
  }
  return currentReview
}

async function ensureLabel(github, owner, repo, label) {
  try {
    await github.rest.issues.getLabel({ owner, repo, name: label.name })
  } catch (error) {
    if (error.status !== 404) {
      throw error
    }
    try {
      await github.rest.issues.createLabel({ owner, repo, ...label })
    } catch (createError) {
      if (createError.status !== 422) {
        throw createError
      }
    }
  }
}

async function getAcceptanceContext({
  github,
  context,
  pullRequestNumber,
  expectedHeadSha,
  requireApprovalComment = false,
}) {
  const normalizedPullRequestNumber = normalizePositiveInteger(
    pullRequestNumber,
    'pull_request_number',
  )
  const { owner, repo } = context.repo
  const pullRequestResponse = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: normalizedPullRequestNumber,
  })
  const pullRequest = pullRequestResponse.data
  const issueNumber = assertAcceptablePullRequest({ pullRequest, context })
  if (
    expectedHeadSha
    && pullRequest.head.sha.toLowerCase() !== validateHeadSha(expectedHeadSha, 'expected head SHA')
  ) {
    throw new Error(`Pull Request #${normalizedPullRequestNumber} changed during preview acceptance.`)
  }

  const issueResponse = await github.rest.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  })
  const issue = issueResponse.data
  const { pullRequestLabels, issueLabels } = assertAcceptedLabels({
    pullRequest,
    issue,
    issueNumber,
  })
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: normalizedPullRequestNumber,
    per_page: 100,
  })
  findCurrentApprovedReview(comments, pullRequest)
  const approvalHeadMarker = previewApprovalHeadMarker(pullRequest.head.sha)
  const approvalComment = comments.find((comment) =>
    comment.user?.type === 'Bot'
    && comment.body?.includes(PREVIEW_APPROVAL_MARKER)
    && comment.body?.includes(approvalHeadMarker),
  )
  if (requireApprovalComment && !approvalComment) {
    throw new Error(`Pull Request #${normalizedPullRequestNumber} has no preview approval for this SHA.`)
  }

  const checks = await verifyPreviewChecks({ github, owner, repo, pullRequest })
  return {
    owner,
    repo,
    pullRequestNumber: normalizedPullRequestNumber,
    pullRequest,
    pullRequestLabels,
    issueNumber,
    issue,
    issueLabels,
    approvalComment,
    ...checks,
  }
}

export function buildPreviewApprovalComment({ headSha, previewUrl }) {
  return [
    PREVIEW_APPROVAL_MARKER,
    previewApprovalHeadMarker(headSha),
    '### Deploy Preview approuvée',
    '',
    `La validation humaine de la [preview Netlify](${previewUrl}) est enregistrée pour le commit \`${headSha.slice(0, 12)}\`.`,
    '',
    'La Pull Request va être fusionnée par squash dans `develop`, puis la CI et le déploiement de l’environnement de développement seront relancés.',
    '',
    'Cette commande ne déploie pas en production.',
  ].join('\n')
}

export async function handlePreviewApproval({ github, context, core }) {
  const eventIssue = context.payload.issue
  const comment = context.payload.comment
  if (!eventIssue || !comment || !isPreviewApprovalCommand(comment.body)) {
    core.info('This comment is not a preview approval command.')
    core.setOutput('approval_status', 'ignored')
    return
  }
  if (!eventIssue.pull_request) {
    core.warning('Preview approval commands are accepted only on pull requests.')
    core.setOutput('approval_status', 'rejected')
    return
  }
  if (!isTrustedAssociation(comment.author_association)) {
    core.warning('The preview approval command was posted by an untrusted account.')
    core.setOutput('approval_status', 'rejected')
    return
  }

  const acceptance = await getAcceptanceContext({
    github,
    context,
    pullRequestNumber: eventIssue.number,
  })
  await ensureLabel(github, acceptance.owner, acceptance.repo, ACCEPTANCE_LABELS.approved)
  if (!acceptance.pullRequestLabels.has(ACCEPTANCE_LABELS.approved.name)) {
    await github.rest.issues.addLabels({
      owner: acceptance.owner,
      repo: acceptance.repo,
      issue_number: acceptance.pullRequestNumber,
      labels: [ACCEPTANCE_LABELS.approved.name],
    })
  }
  if (!acceptance.issueLabels.has(ACCEPTANCE_LABELS.approved.name)) {
    await github.rest.issues.addLabels({
      owner: acceptance.owner,
      repo: acceptance.repo,
      issue_number: acceptance.issueNumber,
      labels: [ACCEPTANCE_LABELS.approved.name],
    })
  }
  if (!acceptance.approvalComment) {
    await github.rest.issues.createComment({
      owner: acceptance.owner,
      repo: acceptance.repo,
      issue_number: acceptance.pullRequestNumber,
      body: buildPreviewApprovalComment({
        headSha: acceptance.pullRequest.head.sha,
        previewUrl: acceptance.previewUrl,
      }),
    })
  }

  core.setOutput('approval_status', ACCEPTANCE_LABELS.approved.name)
  core.setOutput('pull_request_number', String(acceptance.pullRequestNumber))
  core.setOutput('issue_number', String(acceptance.issueNumber))
  core.setOutput('head_sha', acceptance.pullRequest.head.sha)
  core.setOutput('preview_url', acceptance.previewUrl)
}

export async function mergeAcceptedPreview({
  github,
  context,
  core,
  pullRequestNumber,
  expectedHeadSha,
}) {
  const acceptance = await getAcceptanceContext({
    github,
    context,
    pullRequestNumber,
    expectedHeadSha,
    requireApprovalComment: true,
  })

  if (acceptance.pullRequest.draft) {
    await github.graphql(
      `mutation MarkPullRequestReady($pullRequestId: ID!) {
        markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
          pullRequest { isDraft }
        }
      }`,
      { pullRequestId: acceptance.pullRequest.node_id },
    )
  }

  const cleanTitle = sanitizeProductText(acceptance.pullRequest.title, 200)
  const mergeResponse = await github.rest.pulls.merge({
    owner: acceptance.owner,
    repo: acceptance.repo,
    pull_number: acceptance.pullRequestNumber,
    sha: acceptance.pullRequest.head.sha,
    merge_method: 'squash',
    commit_title: `${cleanTitle} (#${acceptance.pullRequestNumber})`,
    commit_message: `Preview validée pour l’Issue #${acceptance.issueNumber}.`,
  })
  if (!mergeResponse.data.merged || !mergeResponse.data.sha) {
    throw new Error(
      `GitHub refused to merge Pull Request #${acceptance.pullRequestNumber}: ${mergeResponse.data.message ?? 'unknown reason'}.`,
    )
  }

  await ensureLabel(github, acceptance.owner, acceptance.repo, ACCEPTANCE_LABELS.integrated)
  await github.rest.issues.addLabels({
    owner: acceptance.owner,
    repo: acceptance.repo,
    issue_number: acceptance.issueNumber,
    labels: [ACCEPTANCE_LABELS.integrated.name],
  })
  const integrationBody = [
    INTEGRATION_COMMENT_MARKER,
    '### Fonctionnalité intégrée en développement',
    '',
    `La Pull Request [#${acceptance.pullRequestNumber}](${acceptance.pullRequest.html_url}) a été fusionnée dans \`develop\` après validation de sa preview.`,
    '',
    `Commit d’intégration : \`${mergeResponse.data.sha.slice(0, 12)}\`.`,
    '',
    'Cette étape met à jour l’environnement de développement partagé. Elle ne constitue pas une mise en production.',
  ].join('\n')
  await github.rest.issues.createComment({
    owner: acceptance.owner,
    repo: acceptance.repo,
    issue_number: acceptance.issueNumber,
    body: integrationBody,
  })
  await github.rest.issues.update({
    owner: acceptance.owner,
    repo: acceptance.repo,
    issue_number: acceptance.issueNumber,
    state: 'closed',
    state_reason: 'completed',
  })

  try {
    await github.rest.git.deleteRef({
      owner: acceptance.owner,
      repo: acceptance.repo,
      ref: `heads/${acceptance.pullRequest.head.ref}`,
    })
  } catch (error) {
    if (![404, 422].includes(error.status)) {
      throw error
    }
  }

  await github.rest.actions.createWorkflowDispatch({
    owner: acceptance.owner,
    repo: acceptance.repo,
    workflow_id: 'ci.yml',
    ref: 'develop',
  })

  core.setOutput('integration_status', ACCEPTANCE_LABELS.integrated.name)
  core.setOutput('merge_sha', mergeResponse.data.sha)
  core.info(`Pull Request #${acceptance.pullRequestNumber} merged into develop.`)
}
