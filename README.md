
# Synupsis web client

Generate a quick summary for all seasons of all TV series of the world.
## Features

- Search a show
- Display show informations and seasons
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
## Deployment

Nuxt web client deployment is automatic on commit on *main* branch.

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
| `query` | `string` | **Required**. Search query |

### get-show

Retrieve all primary information for a given show.

| Parameter | Type     | Description                       |
| :-------- | :------- | :-------------------------------- |
| `slug`      | `string` | **Required**. Slug (*[show name] - [TV Maze id]*) of item to fetch |


## Environment Variables

To run this project, you will need to add the following environment variables to your .env file

`SUPABASE_URL`

`SUPABASE_ANON_KEY`
## Authors

- [@valentingbt](https://www.github.com/valentingbt)
- [@FrogSkyWater](https://www.github.com/FrogSkyWater)
