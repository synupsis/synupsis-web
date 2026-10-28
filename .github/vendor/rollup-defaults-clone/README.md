# Rollup defaults clone

Temporary, private replacement for the single `deepmerge` call in
`@rollup/plugin-node-resolve` 16.0.3. The root Yarn resolution applies only to
that consumer; this is not a general-purpose replacement for `deepmerge`.

Upstream calls `deepMerge({}, defaults)` to clone its own literal options before
deep-freezing the exported `DEFAULTS`. These options contain arrays of strings
and booleans. User-supplied plugin options are combined separately with object
spread. `structuredClone` provides the required copy without the prototype
poisoning in [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).

The adapter rejects non-empty targets, non-plain objects and extra arguments so
an incompatible upstream change fails visibly. Regression tests also exercise
the installed plugin's CommonJS/ESM entry points and guard the dependency graph.
No registry version is relabelled as fixed and no security advisory is ignored.

Remove this package and its resolution when Rollup publishes a version that
removes or fixes its `deepmerge` dependency. Review this contract when updating
`@rollup/plugin-node-resolve`.

Source inspected: [node-resolve v16.0.3](https://github.com/rollup/plugins/blob/node-resolve-v16.0.3/packages/node-resolve/src/index.js).
