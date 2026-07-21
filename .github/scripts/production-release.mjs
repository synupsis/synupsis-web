import { isTrustedActor } from './trusted-actor.mjs'

const PREPARE_PRODUCTION_COMMAND = '/prepare-production'
const APPROVE_PRODUCTION_COMMAND = '/approve-production'
const RELEASE_METADATA_MARKER = '<!-- synupsis-production-release:v1 -->'
const RELEASE_APPROVAL_MARKER = '<!-- synupsis-production-approval:v1 -->'
const RELEASE_RESULT_MARKER = '<!-- synupsis-production-result:v1 -->'
const RELEASE_CONTROL_LABEL = 'ai:release-control'
const CI_CHECK_NAME = 'Lint, typecheck and build'
const CI_WORKFLOW_NAME = 'CI'
const GITHUB_ACTIONS_BOT_LOGIN = 'github-actions[bot]'
const RELEASE_LABELS = {
  candidate: {
    name: 'ai:release-candidate',
    color: '0969da',
    description: 'Snapshot figé de develop proposé pour la production',
  },
  database: {
    name: 'ai:release-db-changes',
    color: 'fbca04',
    description: 'La release contient des changements Supabase à vérifier',
  },
  approved: {
    name: 'ai:release-approved',
    color: '1f883d',
    description: 'La release a reçu sa validation humaine de production',
  },
  promoted: {
    name: 'ai:production-promoted',
    color: '8250df',
    description: 'La release a été fusionnée dans la branche main',
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

function neutralizeMentions(value) {
  return value.replaceAll('@', '@\u200b')
}

function sanitizeLine(value, maxLength = 160) {
  return neutralizeMentions(String(value ?? ''))
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function latestByDate(items, dateFields) {
  return [...items].sort((left, right) => {
    const leftDate = dateFields.map((field) => Date.parse(left[field] ?? '')).find(Number.isFinite) ?? 0
    const rightDate = dateFields.map((field) => Date.parse(right[field] ?? '')).find(Number.isFinite) ?? 0
    return rightDate - leftDate
  })[0]
}

function dateParts(now) {
  const iso = now.toISOString()
  return {
    day: iso.slice(0, 10),
    compact: iso.slice(0, 19).replaceAll('-', '').replaceAll(':', '').replace('T', '-'),
  }
}

function formatCommit(commit) {
  const sha = validateHeadSha(commit.sha, 'commit SHA')
  const subject = sanitizeLine(commit.commit?.message?.split('\n')[0] ?? 'Commit sans titre')
  return `- \`${sha.slice(0, 12)}\` ${subject}`
}

function summarizeReleaseFiles(files = []) {
  const filenames = files.map((file) => file.filename).filter(Boolean)
  return {
    migrations: filenames.filter((filename) => filename.startsWith('supabase/migrations/')),
    supabaseFunctions: filenames.filter((filename) => filename.startsWith('supabase/functions/')),
    workflows: filenames.filter((filename) => filename.startsWith('.github/workflows/')),
    dependencies: filenames.filter((filename) => ['package.json', 'yarn.lock', '.nvmrc'].includes(filename)),
  }
}

function formatFileList(files, emptyLabel = 'Aucun') {
  if (files.length === 0) {
    return `- ${emptyLabel}`
  }
  return files.slice(0, 20).map((filename) => `- \`${sanitizeLine(filename, 240)}\``).join('\n')
}

export function isPrepareProductionCommand(body = '') {
  return body === PREPARE_PRODUCTION_COMMAND
}

export function isApproveProductionCommand(body = '') {
  return body === APPROVE_PRODUCTION_COMMAND
}

export function releaseHeadMarker(headSha) {
  return `<!-- synupsis-production-head:${validateHeadSha(headSha)} -->`
}

export function releaseBaseMarker(baseSha) {
  return `<!-- synupsis-production-base:${validateHeadSha(baseSha, 'base SHA')} -->`
}

export function releaseControlIssueMarker(issueNumber) {
  return `<!-- synupsis-production-control-issue:${normalizePositiveInteger(issueNumber, 'control issue number')} -->`
}

function releaseBranchName(now, headSha) {
  return `release/${dateParts(now).compact}-${validateHeadSha(headSha).slice(0, 12)}`
}

function releaseTitle(now) {
  return `Release production ${dateParts(now).day}`
}

export function buildReleasePullRequestBody({
  controlIssueNumber,
  baseSha,
  headSha,
  compare,
}) {
  const files = compare.files ?? []
  const commits = compare.commits ?? []
  const risks = summarizeReleaseFiles(files)
  const commitLines = commits.slice(-30).map(formatCommit)
  if (commits.length > 30) {
    commitLines.unshift(`- … ${commits.length - 30} commits plus anciens sont également inclus.`)
  }

  return [
    RELEASE_METADATA_MARKER,
    releaseHeadMarker(headSha),
    releaseBaseMarker(baseSha),
    releaseControlIssueMarker(controlIssueNumber),
    '## Candidat de production figé',
    '',
    `Cette Pull Request promeut le snapshot \`${headSha.slice(0, 12)}\` de \`develop\` vers \`main\`.`,
    '',
    `- Base \`main\` enregistrée : \`${baseSha.slice(0, 12)}\``,
    `- Commits inclus : **${compare.ahead_by ?? commits.length}**`,
    `- Fichiers modifiés : **${files.length}**`,
    `- Issue de contrôle : #${controlIssueNumber}`,
    '',
    '### Changements sensibles à vérifier',
    '',
    `- Migrations Supabase : **${risks.migrations.length}**`,
    `- Fonctions Supabase : **${risks.supabaseFunctions.length}**`,
    `- Workflows GitHub : **${risks.workflows.length}**`,
    `- Dépendances/runtime : **${risks.dependencies.length}**`,
    '',
    '#### Migrations Supabase',
    '',
    formatFileList(risks.migrations),
    '',
    '### Commits inclus',
    '',
    commitLines.length > 0 ? commitLines.join('\n') : '- Aucun commit listé par GitHub.',
    '',
    '### Validation obligatoire',
    '',
    '- [ ] La CI de cette branche de release est verte.',
    '- [ ] `https://dev-synupsis.netlify.app` a été testé par un humain.',
    '- [ ] Les migrations et changements de configuration ont été relus.',
    '- [ ] La base `main` et le SHA de release n’ont pas changé.',
    '',
    'Après validation, commenter exactement `/approve-production` sur cette Pull Request.',
    '',
    '> La fusion utilisera un merge commit. Ne pas utiliser Squash and merge pour une release.',
  ].join('\n')
}

export function buildReleaseMetadataComment({ controlIssueNumber, baseSha, headSha }) {
  return [
    RELEASE_METADATA_MARKER,
    releaseHeadMarker(headSha),
    releaseBaseMarker(baseSha),
    releaseControlIssueMarker(controlIssueNumber),
    '### Métadonnées de release',
    '',
    `Snapshot figé : \`${headSha}\``,
    '',
    `Base de production : \`${baseSha}\``,
    '',
    'Ces valeurs sont enregistrées par le pipeline et seront revalidées juste avant la fusion.',
  ].join('\n')
}

export function buildReleaseApprovalComment({ headSha, baseSha }) {
  return [
    RELEASE_APPROVAL_MARKER,
    releaseHeadMarker(headSha),
    releaseBaseMarker(baseSha),
    '### Mise en production approuvée',
    '',
    `La validation humaine est enregistrée pour le snapshot \`${headSha.slice(0, 12)}\` et la base \`main\` \`${baseSha.slice(0, 12)}\`.`,
    '',
    'Le pipeline va revalider ces deux SHA et la CI avant de fusionner la release dans `main` par merge commit.',
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
      if (createError.status !== 422) {
        throw createError
      }
    }
  }
}

async function getReleaseControlIssue({ github, context, issueNumber }) {
  const normalizedIssueNumber = normalizePositiveInteger(issueNumber, 'control issue number')
  const { owner, repo } = context.repo
  const response = await github.rest.issues.get({
    owner,
    repo,
    issue_number: normalizedIssueNumber,
  })
  const issue = response.data
  if (issue.pull_request) {
    throw new Error(`#${normalizedIssueNumber} must be an Issue, not a Pull Request.`)
  }
  if (issue.state !== 'open') {
    throw new Error(`Release control Issue #${normalizedIssueNumber} is not open.`)
  }
  if (!isTrustedActor(issue)) {
    throw new Error(`Release control Issue #${normalizedIssueNumber} was not created by a trusted member.`)
  }
  if (!labelsOf(issue).has(RELEASE_CONTROL_LABEL)) {
    throw new Error(`Release control Issue #${normalizedIssueNumber} is missing label ${RELEASE_CONTROL_LABEL}.`)
  }
  return issue
}

function findOpenReleasePullRequest(pullRequests) {
  return pullRequests.find((pullRequest) =>
    pullRequest.state === 'open'
    && pullRequest.base?.ref === 'main'
    && pullRequest.head?.ref?.startsWith('release/')
    && labelsOf(pullRequest).has(RELEASE_LABELS.candidate.name),
  )
}

export async function handleProductionPreparation({ github, context, core, now = new Date() }) {
  const eventIssue = context.payload.issue
  const comment = context.payload.comment
  if (!eventIssue || !comment || !isPrepareProductionCommand(comment.body)) {
    core.info('This comment is not a production preparation command.')
    core.setOutput('preparation_status', 'ignored')
    return
  }
  if (eventIssue.pull_request) {
    core.warning('Production preparation commands are accepted only on the release control Issue.')
    core.setOutput('preparation_status', 'rejected')
    return
  }
  if (!isTrustedActor(comment)) {
    core.warning('The production preparation command was posted by an untrusted account.')
    core.setOutput('preparation_status', 'rejected')
    return
  }

  const { owner, repo } = context.repo
  const controlIssueNumber = normalizePositiveInteger(eventIssue.number, 'control issue number')
  await getReleaseControlIssue({ github, context, issueNumber: controlIssueNumber })

  const openPullRequestsResponse = await github.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    base: 'main',
    per_page: 100,
  })
  const existingRelease = findOpenReleasePullRequest(openPullRequestsResponse.data)
  if (existingRelease) {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: controlIssueNumber,
      body: `Une release est déjà en attente : [#${existingRelease.number}](${existingRelease.html_url}).`,
    })
    core.setOutput('preparation_status', RELEASE_LABELS.candidate.name)
    core.setOutput('pull_request_number', String(existingRelease.number))
    core.setOutput('release_branch', existingRelease.head.ref)
    core.setOutput('head_sha', existingRelease.head.sha)
    return
  }

  const [developRefResponse, mainRefResponse] = await Promise.all([
    github.rest.git.getRef({ owner, repo, ref: 'heads/develop' }),
    github.rest.git.getRef({ owner, repo, ref: 'heads/main' }),
  ])
  const headSha = validateHeadSha(developRefResponse.data.object.sha, 'develop SHA')
  const baseSha = validateHeadSha(mainRefResponse.data.object.sha, 'main SHA')
  if (headSha === baseSha) {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: controlIssueNumber,
      body: '`develop` et `main` pointent déjà sur le même commit : aucune release à préparer.',
    })
    core.setOutput('preparation_status', 'no-changes')
    return
  }

  const compareResponse = await github.rest.repos.compareCommitsWithBasehead({
    owner,
    repo,
    basehead: 'main...develop',
    per_page: 100,
  })
  const compare = compareResponse.data
  if (!['ahead', 'diverged'].includes(compare.status) || Number(compare.ahead_by) <= 0) {
    throw new Error('develop does not contain releasable commits ahead of main.')
  }

  const releaseBranch = releaseBranchName(now, headSha)
  await github.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${releaseBranch}`,
    sha: headSha,
  })

  let pullRequest
  try {
    const pullRequestResponse = await github.rest.pulls.create({
      owner,
      repo,
      base: 'main',
      head: releaseBranch,
      title: releaseTitle(now),
      body: buildReleasePullRequestBody({ controlIssueNumber, baseSha, headSha, compare }),
      draft: true,
      maintainer_can_modify: false,
    })
    pullRequest = pullRequestResponse.data
  } catch (error) {
    try {
      await github.rest.git.deleteRef({ owner, repo, ref: `heads/${releaseBranch}` })
    } catch {
      // Keep the original Pull Request creation error.
    }
    throw error
  }

  await ensureLabel(github, owner, repo, RELEASE_LABELS.candidate)
  const releaseLabels = [RELEASE_LABELS.candidate.name]
  const risks = summarizeReleaseFiles(compare.files ?? [])
  if (risks.migrations.length > 0 || risks.supabaseFunctions.length > 0) {
    await ensureLabel(github, owner, repo, RELEASE_LABELS.database)
    releaseLabels.push(RELEASE_LABELS.database.name)
  }
  await github.rest.issues.addLabels({
    owner,
    repo,
    issue_number: pullRequest.number,
    labels: releaseLabels,
  })
  await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: pullRequest.number,
    body: buildReleaseMetadataComment({ controlIssueNumber, baseSha, headSha }),
  })
  await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: controlIssueNumber,
    body: [
      '### Release de production préparée',
      '',
      `La Pull Request [#${pullRequest.number}](${pullRequest.html_url}) fige \`develop\` au commit \`${headSha.slice(0, 12)}\`.`,
      '',
      'La CI a été déclenchée explicitement. Aucun déploiement de production n’a encore lieu.',
    ].join('\n'),
  })
  await github.rest.actions.createWorkflowDispatch({
    owner,
    repo,
    workflow_id: 'ci.yml',
    ref: releaseBranch,
  })

  core.setOutput('preparation_status', RELEASE_LABELS.candidate.name)
  core.setOutput('pull_request_number', String(pullRequest.number))
  core.setOutput('release_branch', releaseBranch)
  core.setOutput('head_sha', headSha)
  core.setOutput('base_sha', baseSha)
}

function assertReleasePullRequest({ pullRequest, context }) {
  const expectedRepository = `${context.repo.owner}/${context.repo.repo}`
  if (pullRequest.state !== 'open') {
    throw new Error(`Pull Request #${pullRequest.number} is not open.`)
  }
  if (pullRequest.base?.ref !== 'main') {
    throw new Error(`Pull Request #${pullRequest.number} does not target main.`)
  }
  if (pullRequest.head?.repo?.full_name !== expectedRepository) {
    throw new Error(`Pull Request #${pullRequest.number} does not come from the trusted repository.`)
  }
  if (!/^release\/\d{8}-\d{6}-[0-9a-f]{12}$/i.test(pullRequest.head?.ref ?? '')) {
    throw new Error(`Pull Request #${pullRequest.number} does not use a trusted release branch.`)
  }
  if (!labelsOf(pullRequest).has(RELEASE_LABELS.candidate.name)) {
    throw new Error(`Pull Request #${pullRequest.number} is not labelled ${RELEASE_LABELS.candidate.name}.`)
  }
}

function parseControlIssueNumber(body) {
  const match = body.match(/<!-- synupsis-production-control-issue:(\d+) -->/)
  return match ? normalizePositiveInteger(match[1], 'control issue number') : null
}

function findReleaseMetadata(comments, pullRequest) {
  const comment = comments.find((candidate) =>
    candidate.user?.type === 'Bot'
    && candidate.user?.login === GITHUB_ACTIONS_BOT_LOGIN
    && candidate.body?.includes(RELEASE_METADATA_MARKER)
    && candidate.body?.includes(releaseHeadMarker(pullRequest.head.sha)),
  )
  if (!comment) {
    throw new Error(`Pull Request #${pullRequest.number} has no trusted release metadata for its current SHA.`)
  }
  const baseMatch = comment.body.match(/<!-- synupsis-production-base:([0-9a-f]{40}) -->/i)
  const baseSha = baseMatch ? validateHeadSha(baseMatch[1], 'recorded main SHA') : null
  const controlIssueNumber = parseControlIssueNumber(comment.body)
  if (!baseSha || !controlIssueNumber) {
    throw new Error(`Pull Request #${pullRequest.number} contains incomplete release metadata.`)
  }
  return { comment, baseSha, controlIssueNumber }
}

export async function verifyReleaseChecks({ github, owner, repo, pullRequest }) {
  const checkRunsResponse = await github.rest.checks.listForRef({
    owner,
    repo,
    ref: pullRequest.head.sha,
    per_page: 100,
  })
  const ciCheck = latestByDate(
    checkRunsResponse.data.check_runs.filter((checkRun) =>
      checkRun.name === CI_CHECK_NAME && checkRun.app?.slug === 'github-actions',
    ),
    ['completed_at', 'started_at'],
  )
  if (!ciCheck || ciCheck.status !== 'completed' || ciCheck.conclusion !== 'success') {
    throw new Error(`Pull Request #${pullRequest.number} does not have a successful current CI check.`)
  }

  const workflowRunsResponse = await github.rest.actions.listWorkflowRunsForRepo({
    owner,
    repo,
    head_sha: pullRequest.head.sha,
    per_page: 100,
  })
  const currentRun = latestByDate(
    workflowRunsResponse.data.workflow_runs.filter((run) =>
      run.name === CI_WORKFLOW_NAME
      && run.head_sha?.toLowerCase() === pullRequest.head.sha.toLowerCase()
      && run.head_branch === pullRequest.head.ref
      && ['pull_request', 'workflow_dispatch'].includes(run.event),
    ),
    ['updated_at', 'run_started_at', 'created_at'],
  )
  if (!currentRun || currentRun.status !== 'completed' || currentRun.conclusion !== 'success') {
    throw new Error(`Pull Request #${pullRequest.number} does not have a successful CI workflow run for its release branch.`)
  }
  return { checkUrl: ciCheck.details_url, workflowUrl: currentRun.html_url }
}

async function getReleaseContext({
  github,
  context,
  pullRequestNumber,
  expectedHeadSha,
  expectedBaseSha,
  requireApprovalComment = false,
}) {
  const normalizedPullRequestNumber = normalizePositiveInteger(pullRequestNumber, 'pull request number')
  const { owner, repo } = context.repo
  const pullRequestResponse = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: normalizedPullRequestNumber,
  })
  const pullRequest = pullRequestResponse.data
  assertReleasePullRequest({ pullRequest, context })
  const headSha = validateHeadSha(pullRequest.head.sha)
  if (expectedHeadSha && headSha !== validateHeadSha(expectedHeadSha, 'expected head SHA')) {
    throw new Error(`Pull Request #${normalizedPullRequestNumber} changed during production approval.`)
  }

  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: normalizedPullRequestNumber,
    per_page: 100,
  })
  const metadata = findReleaseMetadata(comments, pullRequest)
  if (expectedBaseSha && metadata.baseSha !== validateHeadSha(expectedBaseSha, 'expected base SHA')) {
    throw new Error(`Pull Request #${normalizedPullRequestNumber} has unexpected main metadata.`)
  }
  await getReleaseControlIssue({
    github,
    context,
    issueNumber: metadata.controlIssueNumber,
  })

  const mainRefResponse = await github.rest.git.getRef({ owner, repo, ref: 'heads/main' })
  const currentMainSha = validateHeadSha(mainRefResponse.data.object.sha, 'current main SHA')
  if (currentMainSha !== metadata.baseSha) {
    throw new Error(`main changed after Pull Request #${normalizedPullRequestNumber} was prepared.`)
  }
  if (pullRequest.mergeable === false || pullRequest.mergeable_state === 'dirty') {
    throw new Error(`Pull Request #${normalizedPullRequestNumber} has merge conflicts.`)
  }

  const approvalComment = comments.find((candidate) =>
    candidate.user?.type === 'Bot'
    && candidate.user?.login === GITHUB_ACTIONS_BOT_LOGIN
    && candidate.body?.includes(RELEASE_APPROVAL_MARKER)
    && candidate.body?.includes(releaseHeadMarker(headSha))
    && candidate.body?.includes(releaseBaseMarker(metadata.baseSha)),
  )
  if (requireApprovalComment && !approvalComment) {
    throw new Error(`Pull Request #${normalizedPullRequestNumber} has no production approval for its current SHA.`)
  }

  const checks = await verifyReleaseChecks({ github, owner, repo, pullRequest })
  return {
    owner,
    repo,
    pullRequestNumber: normalizedPullRequestNumber,
    pullRequest,
    headSha,
    approvalComment,
    ...metadata,
    ...checks,
  }
}

export async function handleProductionApproval({ github, context, core }) {
  const eventIssue = context.payload.issue
  const comment = context.payload.comment
  if (!eventIssue || !comment || !isApproveProductionCommand(comment.body)) {
    core.info('This comment is not a production approval command.')
    core.setOutput('approval_status', 'ignored')
    return
  }
  if (!eventIssue.pull_request) {
    core.warning('Production approvals are accepted only on release Pull Requests.')
    core.setOutput('approval_status', 'rejected')
    return
  }
  if (!isTrustedActor(comment)) {
    core.warning('The production approval command was posted by an untrusted account.')
    core.setOutput('approval_status', 'rejected')
    return
  }

  const release = await getReleaseContext({
    github,
    context,
    pullRequestNumber: eventIssue.number,
  })
  await ensureLabel(github, release.owner, release.repo, RELEASE_LABELS.approved)
  await github.rest.issues.addLabels({
    owner: release.owner,
    repo: release.repo,
    issue_number: release.pullRequestNumber,
    labels: [RELEASE_LABELS.approved.name],
  })
  if (!release.approvalComment) {
    await github.rest.issues.createComment({
      owner: release.owner,
      repo: release.repo,
      issue_number: release.pullRequestNumber,
      body: buildReleaseApprovalComment({ headSha: release.headSha, baseSha: release.baseSha }),
    })
  }

  core.setOutput('approval_status', RELEASE_LABELS.approved.name)
  core.setOutput('pull_request_number', String(release.pullRequestNumber))
  core.setOutput('head_sha', release.headSha)
  core.setOutput('base_sha', release.baseSha)
  core.setOutput('control_issue_number', String(release.controlIssueNumber))
}

export async function mergeApprovedProduction({
  github,
  context,
  core,
  pullRequestNumber,
  expectedHeadSha,
  expectedBaseSha,
}) {
  const release = await getReleaseContext({
    github,
    context,
    pullRequestNumber,
    expectedHeadSha,
    expectedBaseSha,
    requireApprovalComment: true,
  })

  if (release.pullRequest.draft) {
    await github.graphql(
      `mutation MarkPullRequestReady($pullRequestId: ID!) {
        markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
          pullRequest { isDraft }
        }
      }`,
      { pullRequestId: release.pullRequest.node_id },
    )
  }

  const title = sanitizeLine(release.pullRequest.title, 180)
  const mergeResponse = await github.rest.pulls.merge({
    owner: release.owner,
    repo: release.repo,
    pull_number: release.pullRequestNumber,
    sha: release.headSha,
    merge_method: 'merge',
    commit_title: `${title} (#${release.pullRequestNumber})`,
    commit_message: `Promotion validée du snapshot develop ${release.headSha}.`,
  })
  if (!mergeResponse.data.merged || !mergeResponse.data.sha) {
    throw new Error(
      `GitHub refused to merge Pull Request #${release.pullRequestNumber}: ${mergeResponse.data.message ?? 'unknown reason'}.`,
    )
  }

  await ensureLabel(github, release.owner, release.repo, RELEASE_LABELS.promoted)
  await github.rest.issues.addLabels({
    owner: release.owner,
    repo: release.repo,
    issue_number: release.pullRequestNumber,
    labels: [RELEASE_LABELS.promoted.name],
  })

  const resultBody = [
    RELEASE_RESULT_MARKER,
    '### Release fusionnée dans `main`',
    '',
    `Le snapshot \`${release.headSha.slice(0, 12)}\` a été fusionné par merge commit \`${mergeResponse.data.sha.slice(0, 12)}\`.`,
    '',
    'Netlify et Supabase peuvent maintenant démarrer leurs déploiements liés à `main`. Leur réussite doit encore être vérifiée avant de considérer la production comme validée.',
  ].join('\n')
  await github.rest.issues.createComment({
    owner: release.owner,
    repo: release.repo,
    issue_number: release.pullRequestNumber,
    body: resultBody,
  })
  await github.rest.issues.createComment({
    owner: release.owner,
    repo: release.repo,
    issue_number: release.controlIssueNumber,
    body: [
      '### Promotion vers la production déclenchée',
      '',
      `La Pull Request [#${release.pullRequestNumber}](${release.pullRequest.html_url}) a été fusionnée dans \`main\`.`,
      '',
      `Merge commit : \`${mergeResponse.data.sha.slice(0, 12)}\`.`,
      '',
      'Vérifier maintenant les déploiements Supabase et Netlify ainsi que le smoke test de `https://synupsis.com`.',
    ].join('\n'),
  })

  try {
    await github.rest.git.deleteRef({
      owner: release.owner,
      repo: release.repo,
      ref: `heads/${release.pullRequest.head.ref}`,
    })
  } catch (error) {
    if (![404, 422].includes(error.status)) {
      throw error
    }
  }

  core.setOutput('promotion_status', RELEASE_LABELS.promoted.name)
  core.setOutput('merge_sha', mergeResponse.data.sha)
  core.info(`Pull Request #${release.pullRequestNumber} merged into main.`)
}
