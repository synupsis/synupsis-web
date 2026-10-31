import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ESLint } from 'eslint'

const require = createRequire(import.meta.url)
const consumerRequire = name => createRequire(require.resolve(name))

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'synupsis-glob-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  for (const name of ['nested', 'skip']) mkdirSync(join(directory, name))
  for (const name of ['root.txt', 'nested/child.txt', 'skip/secret.txt', '.hidden.txt', 'other.js']) {
    writeFileSync(join(directory, name), 'fixture\n')
  }
  return directory
}

test('the lockfile contains only patched minimatch and glob versions', () => {
  const lock = readFileSync(new URL('../../yarn.lock', import.meta.url), 'utf8')
  for (const [name, minimum] of [['minimatch', [11, 0, 1]], ['glob', [14, 0, 2]]]) {
    const entries = lock.split(/\r?\n\s*\r?\n/).filter(entry => entry.startsWith(`${name}@`))
    assert.ok(entries.length > 0, `${name} must remain covered by this guard`)
    for (const entry of entries) {
      const version = entry.match(/^  version "(\d+)\.(\d+)\.(\d+)"$/m)
      assert.ok(version, `Expected a stable registry version for ${name}`)
      const parts = version.slice(1).map(Number)
      const firstDifference = parts.findIndex((part, index) => part !== minimum[index])
      assert.ok(firstDifference === -1 || parts[firstDifference] > minimum[firstDifference], `${name}@${version[0]} is vulnerable`)
    }
  }
})

test('the migrated linter parses TypeScript and still reports JavaScript and Vue errors', async () => {
  const eslint = new ESLint()
  const [valid] = await eslint.lintText('const value: number = 1;\nexport { value };\n', { filePath: 'lib/lint-smoke.ts' })
  assert.equal(valid.errorCount, 0)
  const [script] = await eslint.lintText('if (true) {}\n', { filePath: 'lib/lint-smoke.js' })
  assert.ok(script.messages.some(message => message.ruleId === 'no-empty'))
  const [component] = await eslint.lintText(
    '<script setup lang="ts">const value: number = 1;</script>\n<template><div id="a" id="b">{{ value }}</div></template>',
    { filePath: 'components/LintSmoke.vue' },
  )
  assert.ok(component.messages.some(message => message.ruleId === 'vue/no-duplicate-attributes'))
  assert.ok(!component.messages.some(message => message.fatal))
  for (const path of ['.nuxt/app.js', '.output/server/index.mjs', 'components/shadcn/ui.ts', 'supabase/functions/index.ts', 'types/generated/database.ts']) {
    assert.equal(await eslint.isPathIgnored(path), true, path)
  }
})

test('glob consumers preserve async/sync matching, exclusions and cancellation', async t => {
  const cwd = fixture(t)
  for (const consumer of ['workbox-build', '@vercel/nft', 'archiver-utils']) {
    const glob = consumerRequire(consumer)('glob')
    const options = { cwd, nodir: true, ignore: ['skip/**'] }
    const expected = ['nested/child.txt', 'root.txt']
    assert.deepEqual((await glob.glob('**/*.txt', options)).sort(), expected, consumer)
    assert.deepEqual(glob.sync('**/*.txt', options).sort(), expected, consumer)
    const controller = new AbortController()
    const reason = new Error('cancelled test traversal')
    controller.abort(reason)
    let reads = 0
    await assert.rejects(glob.glob('**/*', {
      cwd,
      signal: controller.signal,
      fs: {
        readdir(_path, _options, callback) {
          reads += 1
          queueMicrotask(() => callback(null, []))
        },
      },
    }), error => error === reason)
    // Rejection alone is insufficient: the vulnerable walker kept doing I/O.
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(reads, 0, `${consumer} must stop filesystem reads after cancellation`)
  }
})

test('legacy filelist consumers still match and exclude files with minimatch 11', t => {
  const cwd = fixture(t)
  const { FileList } = require('filelist')
  const files = new FileList(join(cwd, '**/*.txt'))
  files.exclude(join(cwd, 'skip/**'))
  assert.deepEqual(files.toArray().sort(), [join(cwd, 'nested/child.txt'), join(cwd, 'root.txt')].sort())
})

test('Nitro archives still select nested files and honour glob exclusions', async t => {
  const cwd = fixture(t)
  const archive = require('archiver')('zip')
  const names = []
  const chunks = []
  archive.on('entry', entry => names.push(entry.name))
  archive.on('data', chunk => chunks.push(chunk))
  const ended = once(archive, 'end')
  archive.glob('**/*.txt', { cwd, ignore: ['skip/**'] })
  await Promise.all([archive.finalize(), ended])
  assert.deepEqual(names.sort(), ['nested/child.txt', 'root.txt'])
  assert.equal(Buffer.concat(chunks).subarray(0, 2).toString(), 'PK')
})
