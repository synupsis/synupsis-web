import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'

import cloneRollupDefaults from '../vendor/rollup-defaults-clone/index.cjs'

const require = createRequire(import.meta.url)
const expectedDefaults = {
  dedupe: [],
  extensions: ['.mjs', '.js', '.json', '.node'],
  resolveOnly: [],
  moduleDirectories: ['node_modules'],
  modulePaths: [],
  ignoreSideEffectsForRoot: false,
  allowExportsFolderMapping: true,
}

test('Rollup defaults are copied without sharing arrays or mutating the source', () => {
  const source = structuredClone(expectedDefaults)
  const target = {}
  const clone = cloneRollupDefaults(target, source)

  assert.deepEqual(clone, expectedDefaults)
  assert.notEqual(clone, source)
  assert.notEqual(clone, target)
  for (const key of ['dedupe', 'extensions', 'resolveOnly', 'moduleDirectories', 'modulePaths']) {
    assert.notEqual(clone[key], source[key])
    clone[key].push('changed')
  }
  assert.deepEqual(source, expectedDefaults)
  assert.deepEqual(target, {})
})

test('prototype-related source keys remain own data without poisoning prototypes', () => {
  const source = JSON.parse(`{
    "__proto__": { "rollupClonePolluted": true },
    "constructor": { "prototype": { "rollupClonePolluted": true } },
    "nested": { "__proto__": { "rollupClonePolluted": true } }
  }`)
  const before = JSON.stringify(source)
  const prototypeBefore = Object.getOwnPropertyDescriptors(Object.prototype)
  const clone = cloneRollupDefaults({}, source)

  assert.equal(Object.getPrototypeOf(clone), Object.prototype)
  assert.equal(Object.getPrototypeOf(clone.nested), Object.prototype)
  assert.equal(clone.rollupClonePolluted, undefined)
  assert.equal(clone.nested.rollupClonePolluted, undefined)
  assert.ok(Object.hasOwn(clone, '__proto__'))
  assert.ok(Object.hasOwn(clone.nested, '__proto__'))
  assert.deepEqual(clone.__proto__, { rollupClonePolluted: true })
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), prototypeBefore)
  clone.constructor.prototype.rollupClonePolluted = false
  clone.__proto__.rollupClonePolluted = false
  assert.equal(JSON.stringify(source), before)
})

test('unsupported merge calls fail instead of silently changing upstream semantics', () => {
  const invalidTargets = [
    null, undefined, [], 'text', { existing: true }, Object.create(null),
    Object.create({ inherited: true }),
    Object.defineProperty({}, 'hidden', { value: true }),
    { [Symbol('hidden')]: true },
  ]
  for (const target of invalidTargets) {
    assert.throws(() => cloneRollupDefaults(target, {}), TypeError)
  }
  for (const source of [null, undefined, [], 'text', new Date(), Object.create(null)]) {
    assert.throws(() => cloneRollupDefaults({}, source), TypeError)
  }
  for (const args of [[], [{}], [{}, {}, {}], [{}, {}, undefined]]) {
    assert.throws(() => cloneRollupDefaults(...args), TypeError)
  }
})

test('the installed Rollup dependency resolves to the private replacement', () => {
  const pluginRequire = createRequire(require.resolve('@rollup/plugin-node-resolve'))
  const replacementPath = pluginRequire.resolve('deepmerge')
  const manifest = JSON.parse(readFileSync(join(dirname(replacementPath), 'package.json'), 'utf8'))

  assert.equal(manifest.name, '@synupsis/rollup-defaults-clone')
  assert.equal(manifest.private, true)
  assert.deepEqual(pluginRequire('deepmerge')({}, expectedDefaults), expectedDefaults)
  assert.throws(() => pluginRequire('deepmerge')({ existing: true }, {}), TypeError)
})

test('real ESM and CommonJS Rollup entry points expose frozen defaults and usable factories', async () => {
  const esm = await import('@rollup/plugin-node-resolve')
  const cjs = require('@rollup/plugin-node-resolve')

  for (const pluginModule of [esm, cjs]) {
    assert.deepEqual(pluginModule.DEFAULTS, expectedDefaults)
    assert.ok(Object.isFrozen(pluginModule.DEFAULTS))
    for (const value of Object.values(pluginModule.DEFAULTS)) {
      if (Array.isArray(value)) assert.ok(Object.isFrozen(value))
    }
    const plugin = pluginModule.nodeResolve({ extensions: [...pluginModule.DEFAULTS.extensions, '.ts'] })
    assert.equal(plugin.name, 'node-resolve')
    assert.equal(typeof plugin.buildStart, 'function')
    assert.equal(typeof plugin.resolveId.handler, 'function')
    assert.deepEqual(pluginModule.DEFAULTS, expectedDefaults)
  }
})

test('the lockfile keeps the replacement limited to the reviewed Rollup consumer', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.ok(!Object.hasOwn(manifest[group] ?? {}, 'deepmerge'), 'A direct deepmerge dependency needs separate review.')
  }
  assert.equal(
    manifest.resolutions['**/@rollup/plugin-node-resolve/deepmerge'],
    'file:.github/vendor/rollup-defaults-clone',
  )

  // Yarn v1 entries are separated by blank lines. Inspect only dependency
  // declarations, including optional packages not installed on this platform.
  const lockfile = readFileSync(new URL('../../yarn.lock', import.meta.url), 'utf8')
  const sections = lockfile.trim().split(/\r?\n\s*\r?\n/)
  const consumers = sections.filter(section => /^    "?deepmerge"?\s/m.test(section))
  assert.equal(consumers.length, 1, 'Review every new deepmerge consumer before extending the replacement.')
  assert.match(consumers[0], /^"?@rollup\/plugin-node-resolve@/)

  const replacements = sections.filter(section => /^(?:[^\n]*, )?"?deepmerge@/.test(section))
  assert.equal(replacements.length, 1, 'The registry deepmerge package must not return alongside the replacement.')
  assert.match(replacements[0].split('\n')[0], /deepmerge@file:\.github\/vendor\/rollup-defaults-clone/)
  assert.doesNotMatch(replacements[0], /^  resolved /m, 'The private package must resolve from the repository, not a remote source.')
})
