'use strict'

// @rollup/plugin-node-resolve uses deepmerge only as deepMerge({}, defaults).
// This deliberately supports that clone operation, not the general merge API.
module.exports = function cloneRollupDefaults(target, source) {
  const isPlainObject = (value) => value !== null
    && typeof value === 'object'
    && Object.getPrototypeOf(value) === Object.prototype

  if (arguments.length !== 2
    || !isPlainObject(target)
    || Reflect.ownKeys(target).length !== 0
    || !isPlainObject(source)) {
    throw new TypeError('Rollup defaults clone only supports (empty plain object, plain object); review the dependency override.')
  }

  // Native cloning preserves nested arrays without assigning through __proto__.
  return structuredClone(source)
}
