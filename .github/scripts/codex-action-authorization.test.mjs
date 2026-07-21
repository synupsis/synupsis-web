import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ORCHESTRATOR = "allow-bot-users: 'synupsis-orchestrator[bot]'"
const workflows = [
  '../workflows/ai-feature-spec.yml',
  '../workflows/ai-feature-development.yml',
  '../workflows/ai-feature-correction.yml',
]

test('les agents déclenchables depuis Telegram autorisent explicitement son bot', () => {
  for (const relativePath of workflows) {
    const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    const actionBlocks = contents.match(/uses: openai\/codex-action@v1[\s\S]*?codex-args:.*$/gm) ?? []
    assert.ok(actionBlocks.length > 0, `${relativePath} doit contenir une action Codex`)
    for (const block of actionBlocks) {
      assert.match(block, new RegExp(escapeRegExp(ORCHESTRATOR)), relativePath)
    }
  }
})

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
