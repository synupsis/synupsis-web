import { isTrustedActor } from './trusted-actor.mjs'

const APPROVAL_COMMAND = '/approve-spec'
const SPECIFICATION_COMMENT_MARKER = '<!-- synupsis-ai-spec:v1 -->'
const APPROVAL_COMMENT_MARKER = '<!-- synupsis-ai-approval:v1 -->'
const SPECIFICATION_READY_LABEL = 'ai:spec-ready'

const APPROVED_LABEL = {
  name: 'ai:spec-approved',
  color: '1f883d',
  description: 'Spécification validée par un membre du dépôt',
}

function labelsOf(issue) {
  return new Set(
    (issue.labels ?? [])
      .map((label) => typeof label === 'string' ? label : label.name)
      .filter(Boolean),
  )
}

export function isSpecificationApprovalCommand(body = '') {
  return body === APPROVAL_COMMAND
}

export function buildApprovalComment() {
  return [
    APPROVAL_COMMENT_MARKER,
    '### Spécification approuvée',
    '',
    'La validation humaine est enregistrée. La demande est transmise à l’agent de développement.',
    '',
    'Toute implémentation restera dans une Pull Request brouillon : aucune fusion ni mise en production n’est automatique.',
  ].join('\n')
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
      // Another simultaneous run may have created the label first.
      if (createError.status !== 422) {
        throw createError
      }
    }
  }
}

export async function handleSpecificationApproval({ github, context, core }) {
  const eventIssue = context.payload.issue
  const comment = context.payload.comment

  if (!eventIssue || !comment || !isSpecificationApprovalCommand(comment.body)) {
    core.info('This comment is not a specification approval command.')
    core.setOutput('approval_status', 'ignored')
    return
  }

  if (eventIssue.pull_request) {
    core.warning('Specification approval commands are not accepted on pull requests.')
    core.setOutput('approval_status', 'rejected')
    return
  }

  if (!isTrustedActor(comment)) {
    core.warning('The approval command was posted by an untrusted account.')
    core.setOutput('approval_status', 'rejected')
    return
  }

  const issueNumber = Number(eventIssue.number)
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('The approval event does not contain a valid Issue number.')
  }

  const { owner, repo } = context.repo
  const issueResponse = await github.rest.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  })
  const issue = issueResponse.data

  if (!isTrustedActor(issue)) {
    throw new Error(`#${issueNumber} was not created by a trusted repository member.`)
  }

  if (!labelsOf(issue).has(SPECIFICATION_READY_LABEL)) {
    throw new Error(`#${issueNumber} is not labelled ${SPECIFICATION_READY_LABEL}.`)
  }

  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  })
  const specificationComment = comments.find((candidate) =>
    candidate.user?.type === 'Bot'
    && candidate.body?.includes(SPECIFICATION_COMMENT_MARKER),
  )

  if (!specificationComment) {
    throw new Error(`#${issueNumber} does not contain a published agent specification.`)
  }

  await ensureLabel(github, owner, repo, APPROVED_LABEL)
  await github.rest.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: [APPROVED_LABEL.name],
  })

  const body = buildApprovalComment()
  const previousApprovalComment = comments.find((candidate) =>
    candidate.user?.type === 'Bot'
    && candidate.body?.includes(APPROVAL_COMMENT_MARKER),
  )

  if (previousApprovalComment) {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: previousApprovalComment.id,
      body,
    })
  } else {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    })
  }

  core.setOutput('approval_status', APPROVED_LABEL.name)
  core.setOutput('issue_number', String(issueNumber))
  core.info(`Specification for #${issueNumber} approved.`)
}
