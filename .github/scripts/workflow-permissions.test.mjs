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

test('specification approval can grant every permission required by development', () => {
  const approval = readFileSync('.github/workflows/ai-feature-approval.yml', 'utf8')

  assert.match(approval, /^  actions: write$/m)
  assert.match(approval, /^  contents: write$/m)
  assert.match(approval, /^  issues: write$/m)
  assert.match(approval, /^  pull-requests: write$/m)
})

test('repository analysis separates read-only inspection from report publishing', () => {
  const workflow = '.github/workflows/ai-repository-analysis.yml'
  const source = readFileSync(workflow, 'utf8')
  const analyzeJob = workflowJob(workflow, 'analyze')
  const publishJob = workflowJob(workflow, 'publish')

  assert.match(source, /^permissions: \{\}$/m)
  assert.match(analyzeJob, /^      contents: read$/m)
  assert.match(analyzeJob, /^      issues: read$/m)
  assert.doesNotMatch(analyzeJob, /^      contents: write$/m)
  assert.match(analyzeJob, /^          sandbox: read-only$/m)
  assert.match(analyzeJob, /^          persist-credentials: false$/m)
  assert.match(publishJob, /^      issues: write$/m)
  assert.doesNotMatch(publishJob, /^      contents: write$/m)
})

test('correction workflow accepts trusted preview feedback comments', () => {
  const source = readFileSync('.github/workflows/ai-feature-correction.yml', 'utf8')

  assert.match(source, /startsWith\(github\.event\.comment\.body, '<!-- synupsis-ai-preview-feedback:v1 -->'\)/)
})

test('production release separates approval from the final merge permission', () => {
  const workflow = '.github/workflows/production-release.yml'
  const source = readFileSync(workflow, 'utf8')
  const prepareJob = workflowJob(workflow, 'prepare')
  const authorizeJob = workflowJob(workflow, 'authorize')
  const mergeJob = workflowJob(workflow, 'merge')

  assert.match(source, /^permissions: \{\}$/m)
  assert.match(source, /^  group: production-release$/m)
  assert.match(prepareJob, /^      actions: write$/m)
  assert.match(prepareJob, /^      contents: write$/m)
  assert.match(authorizeJob, /^      actions: read$/m)
  assert.match(authorizeJob, /^      checks: read$/m)
  assert.match(authorizeJob, /^      contents: read$/m)
  assert.doesNotMatch(authorizeJob, /^      contents: write$/m)
  assert.match(mergeJob, /^      contents: write$/m)
  assert.match(mergeJob, /needs\.authorize\.outputs\.approval_status == 'ai:release-approved'/)

  for (const job of [prepareJob, authorizeJob, mergeJob]) {
    assert.match(job, /^          persist-credentials: false$/m)
  }
})
