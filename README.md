
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
