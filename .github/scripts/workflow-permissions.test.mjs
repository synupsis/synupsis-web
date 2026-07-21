import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function workflowJob(workflowPath, jobName) {
  const lines = readFileSync(workflowPath, 'utf8').split('\n')
  const start = lines.findIndex((line) => line === `  ${jobName}:`)
  assert.notEqual(start, -1, `Job ${jobName} is missing from ${workflowPath}.`)
  const nextJob = lines.findIndex((line, index) =>
    index > start && /^  [a-z][a-z0-9_-]*:$/.test(line),
  )
  return lines.slice(start, nextJob === -1 ? undefined : nextJob).join('\n')
}

test('PR comment authorization jobs can update Pull Request labels', () => {
  const workflows = [
    '.github/workflows/ai-feature-correction.yml',
    '.github/workflows/ai-feature-preview-acceptance.yml',
  ]

  for (const workflow of workflows) {
    const authorizeJob = workflowJob(workflow, 'authorize')
    assert.match(authorizeJob, /^      issues: write$/m)
    assert.match(authorizeJob, /^      pull-requests: write$/m)
  }
})

test('automated AI reviews trust only the GitHub Actions bot', () => {
  const reviewJob = workflowJob('.github/workflows/ai-feature-review.yml', 'review')

  assert.match(reviewJob, /^          allow-bot-users: 'github-actions\[bot\]'$/m)
  assert.doesNotMatch(reviewJob, /^          allow-bots: true$/m)
})
