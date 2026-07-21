import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isTrustedActor,
  isTrustedAssociation,
  SYNUPSIS_ORCHESTRATOR_BOT,
} from './trusted-actor.mjs'

test('repository owners, members and collaborators remain trusted', () => {
  assert.equal(isTrustedAssociation('OWNER'), true)
  assert.equal(isTrustedAssociation('member'), true)
  assert.equal(isTrustedAssociation('COLLABORATOR'), true)
  assert.equal(isTrustedAssociation('NONE'), false)
})

test('the exact Synupsis Orchestrator GitHub App identity is trusted', () => {
  assert.equal(isTrustedActor({
    author_association: 'NONE',
    user: { ...SYNUPSIS_ORCHESTRATOR_BOT },
  }), true)
})

test('lookalike bots are rejected unless login, type and numeric id all match', () => {
  const base = {
    author_association: 'NONE',
    user: { ...SYNUPSIS_ORCHESTRATOR_BOT },
  }
  assert.equal(isTrustedActor({ ...base, user: { ...base.user, id: 1 } }), false)
  assert.equal(isTrustedActor({ ...base, user: { ...base.user, login: 'synupsis-orchestrator' } }), false)
  assert.equal(isTrustedActor({ ...base, user: { ...base.user, type: 'User' } }), false)
})
