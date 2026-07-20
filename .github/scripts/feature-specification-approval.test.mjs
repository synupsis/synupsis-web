import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildApprovalComment,
  handleSpecificationApproval,
  isSpecificationApprovalCommand,
} from './feature-specification-approval.mjs'

const readyIssue = {
  number: 12,
  author_association: 'MEMBER',
  labels: [{ name: 'ai:spec-ready' }],
}

const specificationComment = {
  id: 100,
  user: { type: 'Bot' },
  body: '<!-- synupsis-ai-spec:v1 -->\n### Spécification proposée',
}

function createCore() {
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

test('only the exact approval command is accepted', () => {
  assert.equal(isSpecificationApprovalCommand('/approve-spec'), true)
  assert.equal(isSpecificationApprovalCommand('/approve-spec maintenant'), false)
  assert.equal(isSpecificationApprovalCommand(' /approve-spec'), false)
  assert.equal(isSpecificationApprovalCommand('/APPROVE-SPEC'), false)
})

test('approval comments explain that development has not started', () => {
  const comment = buildApprovalComment()

  assert.match(comment, /Spécification approuvée/)
  assert.match(comment, /Aucun code ni déploiement/)
})

test('commands from untrusted accounts are rejected without GitHub writes', async () => {
  let writes = 0
  const { core, outputs } = createCore()
  const github = {
    rest: {
      issues: {
        get: async () => { writes++; return { data: readyIssue } },
      },
    },
  }
  const context = {
    repo: { owner: 'synupsis', repo: 'synupsis-web' },
    payload: {
      issue: readyIssue,
      comment: { body: '/approve-spec', author_association: 'NONE' },
    },
  }

  await handleSpecificationApproval({ github, context, core })

  assert.equal(writes, 0)
  assert.equal(outputs.get('approval_status'), 'rejected')
})

test('a trusted command requires a ready, bot-published specification', async () => {
  const { core } = createCore()
  const context = {
    repo: { owner: 'synupsis', repo: 'synupsis-web' },
    payload: {
      issue: readyIssue,
      comment: { body: '/approve-spec', author_association: 'OWNER' },
    },
  }

  await assert.rejects(
    handleSpecificationApproval({
      github: {
        rest: {
          issues: {
            get: async () => ({ data: { ...readyIssue, labels: [] } }),
          },
        },
      },
      context,
      core,
    }),
    /ai:spec-ready/,
  )

  await assert.rejects(
    handleSpecificationApproval({
      github: {
        rest: {
          issues: {
            get: async () => ({ data: readyIssue }),
            listComments: async () => {},
          },
        },
        paginate: async () => [],
      },
      context,
      core,
    }),
    /published agent specification/,
  )
})

test('a trusted command records one reusable approval', async () => {
  const createdLabels = []
  const addedLabels = []
  const updatedComments = []
  const { core, outputs } = createCore()
  const github = {
    rest: {
      issues: {
        get: async () => ({ data: readyIssue }),
        getLabel: async () => {
          const error = new Error('Not found')
          error.status = 404
          throw error
        },
        createLabel: async ({ name }) => createdLabels.push(name),
        addLabels: async ({ labels }) => addedLabels.push(...labels),
        listComments: async () => {},
        createComment: async () => {
          throw new Error('The existing approval comment should be updated.')
        },
        updateComment: async ({ comment_id, body }) => {
          updatedComments.push({ comment_id, body })
        },
      },
    },
    paginate: async () => [
      specificationComment,
      {
        id: 101,
        user: { type: 'Bot' },
        body: '<!-- synupsis-ai-approval:v1 -->\nAncienne validation',
      },
    ],
  }
  const context = {
    repo: { owner: 'synupsis', repo: 'synupsis-web' },
    payload: {
      issue: readyIssue,
      comment: { body: '/approve-spec', author_association: 'COLLABORATOR' },
    },
  }

  await handleSpecificationApproval({ github, context, core })

  assert.deepEqual(createdLabels, ['ai:spec-approved'])
  assert.deepEqual(addedLabels, ['ai:spec-approved'])
  assert.equal(updatedComments.length, 1)
  assert.equal(updatedComments[0].comment_id, 101)
  assert.match(updatedComments[0].body, /Spécification approuvée/)
  assert.equal(outputs.get('approval_status'), 'ai:spec-approved')
  assert.equal(outputs.get('issue_number'), '12')
})
