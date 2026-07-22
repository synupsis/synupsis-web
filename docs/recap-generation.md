# Recap generation pipeline

Synupsis now generates one canonical French recap per season and format version. Existing manually-authored recaps remain valid; evidence-backed generated recaps use format version `3`.

## Current flow

1. An authenticated user requests a missing season recap.
2. The API reuses a published canonical recap or an active generation job when one exists.
3. Trakt supplies the baseline identity, episode metadata and artwork. TMDB enriches French/English summaries when configured; TVmaze adds a second reference source when external IDs match.
4. Every unique narrative fragment is captured in an immutable Evidence Pack with provider, language, trust tier, URL and stable evidence ID.
5. OpenAI generates a cover and 5–10 chronological story beats with Structured Outputs in background mode. Every beat must cite evidence IDs.
6. Synupsis validates episode references, evidence references, evidence-to-episode consistency, source density and story coverage.
7. A passing story is converted deterministically into ordered Konva nodes and published atomically with its slides and source snapshot.
8. A low-confidence story is kept as `needs_review` and is not shown as a published recap.

The browser polls the generation job and completes publication for this first version. A stale active job is expired after 30 minutes, so it cannot block future requests indefinitely.

## Data and rendering rules

- The model receives only the requested show, season and Evidence Pack. It is explicitly told not to use model memory or future-season information.
- Every beat carries `episodeNumbers`, exact `evidenceIds` and `imageEpisodeNumber` for deterministic artwork selection.
- A cited evidence fragment must belong to one of the beat's episodes; the chosen image episode must also be one of those episodes.
- Exact duplicate source texts are removed. Official, licensed transcript and editorial tiers are already represented in the data model but require contracted adapters before they are populated.
- Generated images use a real 9:19.5 cover crop with focal coordinates instead of being stretched.
- Canvas order is preserved for gradients, images, overlays and text groups.
- Text length influences type size and slide reading duration.
- Trakt images are requested with `extended=full` and served through the existing cached image proxy, as required by Trakt's image policy.

## Prompt compatibility

Custom prompts remain supported when they contain these variables:

- `{{seasonQuickFacts}}`
- `{{episodeDetailedList}}`
- `{{targetBeatCount}}`

An incompatible active prompt is ignored and the versioned default prompt is used. The admin prompt page displays the missing variables.

## Deployment

1. Configure `TRAKT_CLIENT_ID`, `OPENAI_API_KEY` and optionally `OPENAI_RECAP_MODEL` in the server environment.
2. Optionally configure `TMDB_API_READ_ACCESS_TOKEN` or `TMDB_API_KEY`. Confirm attribution and commercial-use terms before production use.
3. Apply Supabase migrations with the normal deployment workflow.
4. Ensure the existing `image-proxy` Edge Function and `images` storage bucket are deployed.
5. Generate several known seasons and inspect `recap_generation_job.quality_report`, costs, latency and slide readability before enabling the feature broadly.

## Known limits and next iterations

The current quality gate verifies provenance coverage, evidence density and reference integrity; it still does not prove every sentence semantically against the cited fragment. Reference summaries can also be too short for a detailed recap. The next quality tier should add:

- a separate verifier pass that checks each claim against cited episode sources;
- a licensed richer source where available (official summaries, subtitles or transcripts);
- an admin review queue for `needs_review`, with edit, approve and regenerate actions;
- a server-side worker or scheduled task so finalization no longer depends on browser polling;
- an evaluation dataset of known seasons, scored for factuality, chronology, coverage, readability and image relevance;
- multiple deterministic layout templates selected from content density and image composition.
