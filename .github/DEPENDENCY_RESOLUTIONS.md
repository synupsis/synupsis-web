# Security dependency resolutions

The CI audit remains blocking. Do not ignore these advisories or relabel an old
package as a patched version.

## minimatch and glob (2026-10-31)

- [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249):
  minimatch versions below 11.0.1 are affected by pattern amplification.
- [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4):
  glob 9.0.0 through 14.0.1 can continue filesystem traversal after cancellation.

Nuxt 4.6.3 and Workbox 7.4.1 still pull affected dependencies. Yarn resolutions
select the actual registry releases minimatch 11.0.1 and glob 14.0.2. Both support
the project's Node 24 runtime. Warnings about the consumers' older semver ranges
are expected until those upstream packages update their dependencies.

The glob resolutions are limited to Workbox, `@vercel/nft` and `archiver-utils`,
which use the modern API. ESLint and its TypeScript/Vue plugins were upgraded
with a flat configuration to remove the old ESLint dependency chain, including
glob 7 and the legacy minimatch import contract. The lint file scope and project
rule overrides are retained; the upgraded recommended presets also apply.

The remaining older minimatch consumers (`filelist` and `readdir-glob`, through
archiver) use named properties supported by version 11. Pipeline regression
tests exercise file selection, exclusions, archive generation, cancellation,
the installed linter, and the lockfile's patched-version floor. The full Nuxt
build additionally exercises Workbox and Nitro tracing.

Remove the resolutions when every parent dependency requests a patched version.
When updating these parents, rerun a frozen install, `yarn audit:dependencies`,
`yarn lint`, `yarn typecheck`, `yarn test:pipeline` and `yarn build`.

The separate Rollup/deepmerge replacement is documented in
[`vendor/rollup-defaults-clone/README.md`](vendor/rollup-defaults-clone/README.md).
