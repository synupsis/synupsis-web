const REQUEST_MARKER = '<!-- synupsis-ai-request:v1 -->'
const COMMENT_MARKER = '<!-- synupsis-ai-intake:v1 -->'

const FIELD_DEFINITIONS = [
  { key: 'problem', heading: 'Problème à résoudre', required: true },
  { key: 'audience', heading: 'Utilisateurs concernés', required: true },
  { key: 'outcome', heading: 'Résultat attendu', required: true },
  { key: 'journey', heading: 'Parcours utilisateur imaginé', required: true },
  { key: 'acceptance', heading: 'Critères de validation', required: true },
  { key: 'dataImpact', heading: 'Impact possible sur les données', required: true },
  { key: 'constraints', heading: 'Contraintes et éléments à préserver', required: false },
  { key: 'references', heading: 'Références utiles', required: false },
]

const LABELS = {
  request: {
    name: 'ai:request',
    color: '8250df',
    description: 'Demande destinée au pipeline IA Synupsis',
  },
  ready: {
    name: 'ai:ready-for-spec',
    color: '1f883d',
    description: 'Demande complète et prête pour l’agent de spécification',
  },
  needsInfo: {
    name: 'ai:needs-info',
    color: 'bf8700',
    description: 'Informations manquantes avant la spécification',
  },
  needsApproval: {
    name: 'ai:needs-approval',
    color: 'cf222e',
    description: 'Demande externe nécessitant l’accord d’un mainteneur',
  },
}

const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])
const EMPTY_RESPONSES = new Set(['', '_No response_'])

function cleanResponse(value = '') {
  const cleaned = value.trim()
  return EMPTY_RESPONSES.has(cleaned) ? '' : cleaned
}

export function parseSections(body = '') {
  const sections = new Map()
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  let currentHeading = null
  let currentLines = []

  const flush = () => {
    if (currentHeading) {
      sections.set(currentHeading, cleanResponse(currentLines.join('\n')))
    }
  }

  for (const line of lines) {
    if (line.startsWith('### ')) {
      flush()
      currentHeading = line.slice(4).trim()
      currentLines = []
      continue
    }

    if (currentHeading) {
      currentLines.push(line)
    }
  }

  flush()
  return sections
}

export function normalizeFeatureRequest(body = '') {
  const sections = parseSections(body)

  return Object.fromEntries(
    FIELD_DEFINITIONS.map(({ key, heading }) => [key, sections.get(heading) ?? '']),
  )
}

export function validateFeatureRequest(featureRequest) {
  return FIELD_DEFINITIONS
    .filter(({ key, required }) => required && !featureRequest[key])
    .map(({ heading }) => heading)
}

export function isTrustedAssociation(association = '') {
  return TRUSTED_ASSOCIATIONS.has(association.toUpperCase())
}

function blockquote(value) {
  const safeValue = (value || 'Non précisé')
    .slice(0, 6000)
    .replaceAll('@', '@\u200b')

  return safeValue
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
}

export function buildNormalizedBrief(featureRequest) {
  return [
    '<details>',
    '<summary>Brief initial normalisé</summary>',
    '',
    '#### Problème',
    blockquote(featureRequest.problem),
    '',
    '#### Utilisateurs concernés',
    blockquote(featureRequest.audience),
    '',
    '#### Résultat attendu',
    blockquote(featureRequest.outcome),
    '',
    '#### Parcours utilisateur',
    blockquote(featureRequest.journey),
    '',
    '#### Critères de validation',
    blockquote(featureRequest.acceptance),
    '',
    '#### Impact possible sur les données',
    blockquote(featureRequest.dataImpact),
    '',
    '#### Contraintes',
    blockquote(featureRequest.constraints),
    '',
    '#### Références',
    blockquote(featureRequest.references),
    '',
    '</details>',
  ].join('\n')
}

export function buildStatusComment({ featureRequest, missingFields, trusted }) {
  if (!trusted) {
    return [
      COMMENT_MARKER,
      '### Demande en attente d’approbation',
      '',
      'Cette demande provient d’un compte externe au dépôt. Un mainteneur doit la valider avant qu’un agent puisse être déclenché.',
    ].join('\n')
  }

  if (missingFields.length > 0) {
    return [
      COMMENT_MARKER,
      '### Informations complémentaires nécessaires',
      '',
      'Complète les sections suivantes pour rendre la demande exploitable :',
      '',
      ...missingFields.map((field) => `- ${field}`),
      '',
      'Le statut sera recalculé automatiquement après modification de l’Issue.',
    ].join('\n')
  }

  return [
    COMMENT_MARKER,
    '### Demande prête pour spécification',
    '',
    'Le besoin est suffisamment structuré pour être transmis au futur agent de spécification. Aucun code ni déploiement n’est déclenché à cette étape.',
    '',
    buildNormalizedBrief(featureRequest),
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

export async function handleFeatureRequest({ github, context, core }) {
  const issue = context.payload.issue

  if (!issue || !issue.body?.includes(REQUEST_MARKER)) {
    core.info('This issue is not a Synupsis AI feature request.')
    return
  }

  const { owner, repo } = context.repo
  const issueNumber = issue.number
  const featureRequest = normalizeFeatureRequest(issue.body)
  const missingFields = validateFeatureRequest(featureRequest)
  const trusted = isTrustedAssociation(issue.author_association)
  const statusLabel = !trusted
    ? LABELS.needsApproval
    : missingFields.length > 0
      ? LABELS.needsInfo
      : LABELS.ready

  const managedLabels = [LABELS.request, LABELS.ready, LABELS.needsInfo, LABELS.needsApproval]
  await Promise.all(managedLabels.map((label) => ensureLabel(github, owner, repo, label)))

  const currentLabels = new Set(
    issue.labels
      .map((label) => typeof label === 'string' ? label : label.name)
      .filter(Boolean),
  )
  const desiredLabels = new Set([LABELS.request.name, statusLabel.name])

  await github.rest.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: [...desiredLabels],
  })

  for (const label of managedLabels) {
    if (currentLabels.has(label.name) && !desiredLabels.has(label.name)) {
      await github.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: issueNumber,
        name: label.name,
      })
    }
  }

  const body = buildStatusComment({ featureRequest, missingFields, trusted })
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  })
  const previousComment = comments.find((comment) =>
    comment.user?.type === 'Bot' && comment.body?.includes(COMMENT_MARKER),
  )

  if (previousComment) {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: previousComment.id,
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

  core.setOutput('intake-status', statusLabel.name)
  core.info(`Feature request #${issueNumber} classified as ${statusLabel.name}.`)
}
