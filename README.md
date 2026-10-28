# Synupsis web client

Generate a quick summary for all seasons of all TV series of the world.

## Features

- Search a show
- Display show informations and seasons
- French and English display languages, detected from the browser with an account preference
- [WIP] Authentication
- [WIP] Create recap canvas

## Roadmap

- Summary generation using AI
- ... and more !

## Tech Stack

**Client:** VueJS, Nuxt, TailwindCSS

**Server:** Supabase, Deno

## Run Locally

#### Nuxt

Install the dependencies

```bash
  yarn install
```

Start the development server on `http://localhost:3000`

```bash
  yarn dev
```

#### Supabase

Make sure **Supabase CLI** is installed and **Docker** is running, then start the Supabase development server on `http://localhost:54323`

```bash
  supabase start
```

Run Edge Functions locally

```bash
  supabase functions serve
```

## Display languages

The interface supports French and English. Visitors use the first supported language
from the browser preferences (`Accept-Language` during server rendering, then
`navigator.languages` after hydration), with English as the fallback. Signed-in
users can choose French, English, or **Browser language** in their profile.

The preference is saved in Supabase Auth user metadata as `display_language`
(`fr`, `en`, or `null` for automatic detection). Existing accounts default to the
browser language; no database migration is required. Saving refreshes the session
so the preference also applies to subsequent server-rendered pages. Signing out
restores browser detection. This setting changes the interface, not show metadata
or generated recap content.

Use `useI18n().t('English source text', { name: value })` for interface text and
register the matching French entry in a domain catalog under `lib/i18n/`.
Translate in a template or computed value to keep language changes reactive.
Translation coverage, interpolation parameters, language negotiation and account
preference persistence are checked by `yarn test:pipeline`.

## Validation

Use Node.js 24.15 or newer within the 24.x release line and Yarn 1.22.22.

```bash
yarn install --frozen-lockfile
yarn audit:dependencies
yarn lint
yarn typecheck
yarn test:pipeline
yarn build
```

CI audits both application and development dependencies and fails on any reported
vulnerability or audit failure. The audit requires access to the npm registry.

The targeted `minimatch` resolution in `package.json` updates the vulnerable
`9.0.3` version pinned by TypeScript ESLint 6 to `9.0.9`, without changing its major
version. Remove this resolution when upgrading to a TypeScript ESLint version
that already uses a corrected dependency.

Rollup's `deepmerge` dependency has no published fix for GHSA-gcqx-w48m-w2h4.
A scoped resolution replaces its sole use (cloning internal default options)
with a native clone. See [.github/vendor/rollup-defaults-clone](.github/vendor/rollup-defaults-clone/README.md)
for the contract, regression tests and removal criteria. The vulnerable registry
package is no longer installed; the audit has no advisory exceptions.

## Deployment

The app runs as one long-lived Node server built from the `Dockerfile`: Dokploy (published through Pangolin) for development and Render for production. Recap generation does not work on serverless hosting. See [docs/deployment.md](docs/deployment.md).

The `develop` branch is automatically deployed to the shared development environment on Netlify. Pull requests get an isolated Netlify Deploy Preview. The `main` branch is reserved for the separate Netlify and Supabase production projects.

After testing a generated Pull Request's Deploy Preview, an authorized repository member can approve it with `/approve-preview`. The pipeline then squash-merges it into `develop` only.

Production uses a second, explicit gate: `/prepare-production` freezes the current `develop` SHA into a draft release Pull Request targeting `main`; `/approve-production` revalidates that immutable SHA, the recorded `main` base and release CI before merging with a merge commit. External Netlify and Supabase deployments must still be checked after the merge.

## AI feature pipeline

Non-technical contributors can submit a structured feature request from the **Fonctionnalité assistée par IA** GitHub Issue form. The pipeline specifies, implements, validates and reviews the change before presenting its Netlify preview for explicit human approval.

See [the AI pipeline documentation](docs/ai-pipeline.md) for its current status and safety rules.

To deploy Supabase Edge Functions run

```bash
  supabase functions deploy
```

## Git flow

### Features

#### Start a new feature

`git flow feature start`

#### Finish up a feature

`git flow feature finish --push`

### Bugfixes

#### Start a new bugfix

`git flow bugfix start`

#### Finish up a bugfix

`git flow bugfix finish --push`

### Hotfixes

#### Start a new hotfix

`git flow hotfix start 1.2.x`

#### Finish up a hotfix

`git flow hotfix finish --push`

### Make a release

#### Start a new release

`git flow release start 1.x.x`

#### Finish up a release

`git flow release finish --push`

## Conventions

### Branches

The naming convention for the branches is kebab case.

Example : `feature/my-new-feature`

### Commits

This project uses conventional commits.
`<type>(<optional scope>): <description>`

#### Types

- `feat` : A new feature
- `fix` : A bug fix
- `docs` :Documentation only changes
- `style` : Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
- `refactor` : A code change that neither fixes a bug nor adds a feature
- `perf` : A code change that improves performance
- `test` : Adding missing tests or correcting existing tests
- `build` : Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)
- `chore` : Other changes that don't modify src or test files
- `revert` : Reverts a previous commit

#### Scopes

The `scope` provides additional contextual information.

- all
- homepage
- showpage
- recap
- auth

#### Description

The `description` contains a concise description of the change.

Is a mandatory part of the format
Use the imperative, present tense: "change" not "changed" nor "changes"
Think of `This commit will...` or `This commit should...`
Don't capitalize the first letter
No dot (.) at the end

#### Examples

- `feat: add email notifications on new direct messages`
- `feat(homepage): add the amazing button`
- `build: update dependencies`

## Supabase Edge Functions Reference

### search-show

Search through all the shows in [TV Maze](https://www.tvmaze.com/api) database by the show's name.

| Parameter | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `query`   | `string` | **Required**. Search query |

### get-show

Retrieve all primary information for a given show.

| Parameter | Type     | Description                                                        |
| :-------- | :------- | :----------------------------------------------------------------- |
| `slug`    | `string` | **Required**. Slug (_[show name] - [TV Maze id]_) of item to fetch |

## Environment Variables

To run this project, you will need to add the following environment variables to your .env file

`NUXT_PUBLIC_SUPABASE_URL`

`NUXT_PUBLIC_SUPABASE_KEY`

`NUXT_SUPABASE_SECRET_KEY` (server only)

`TRAKT_CLIENT_ID` (server only, season metadata and episode artwork)

`OPENAI_API_KEY` (server only, recap story generation)

`OPENAI_RECAP_MODEL` (optional, defaults to `gpt-5.6`)

`TMDB_API_READ_ACCESS_TOKEN` or `TMDB_API_KEY` (optional, adds French and English season/episode evidence; TVmaze enrichment needs no key)

The asynchronous recap generation flow, quality gate, deployment steps and current limitations are documented in [docs/recap-generation.md](docs/recap-generation.md). The source-of-truth strategy and richer narrative roadmap are documented in [docs/recap-source-strategy.md](docs/recap-source-strategy.md).

## Authors

- [@valentingbt](https://www.github.com/valentingbt)
- [@FrogSkyWater](https://www.github.com/FrogSkyWater)
