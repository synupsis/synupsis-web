const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])

export const SYNUPSIS_ORCHESTRATOR_BOT = Object.freeze({
  id: 307557269,
  login: 'synupsis-orchestrator[bot]',
  type: 'Bot',
})

export function isTrustedAssociation(association = '') {
  return TRUSTED_ASSOCIATIONS.has(String(association).toUpperCase())
}

export function isTrustedActor(resource = {}) {
  if (isTrustedAssociation(resource.author_association)) {
    return true
  }

  const user = resource.user
  return user?.type === SYNUPSIS_ORCHESTRATOR_BOT.type
    && user?.login === SYNUPSIS_ORCHESTRATOR_BOT.login
    && Number(user?.id) === SYNUPSIS_ORCHESTRATOR_BOT.id
}
