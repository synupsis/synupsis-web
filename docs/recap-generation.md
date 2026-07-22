# Recap generation pipeline

Synupsis generates one canonical French recap per season and format version. Existing manually-authored recaps remain valid; event-backed generated recaps use format version `4`.

## Current flow

1. An authenticated user requests a missing season recap.
2. The API reuses a published canonical recap or an active generation job when one exists.
3. Trakt supplies the baseline identity, episode metadata and artwork. TMDB and TVmaze enrich episode summaries. Wikidata confirms identity and Wikipedia can add a licensed season article when one exists.
4. Every unique narrative fragment is captured in an immutable Evidence Pack with provider, language, trust tier, licence, retrieval time, revision and stable evidence ID.
5. A first Structured Output pass extracts a season event graph: episode references, characters, arc, importance, causal links, contradictions and evidence IDs.
6. Synupsis validates this graph before continuing. Invalid evidence links, poor episode coverage or an undersized graph send the job to `needs_review`.
7. A second Structured Output pass receives only the validated graph and composes a cover plus 5–10 chronological story beats. Every beat cites event IDs; its evidence IDs are derived server-side.
8. Synupsis validates event coverage, chronology references, evidence coverage, source richness, causal integrity and source-rights readiness.
9. A passing story is converted deterministically into ordered Konva nodes and published atomically with its Evidence Pack, event graph, slides and reports.
10. A low-confidence story is kept as `needs_review` and is never shown as a published recap.

The browser polls the generation job and completes publication for this first version. A stale active job is expired after 30 minutes, so it cannot block future requests indefinitely.

## Data and rendering rules

- The extraction model receives only the requested show, season and Evidence Pack. The writing model receives only the resulting validated event graph. Both prompts forbid model memory and future-season information.
- Every event carries exact evidence IDs. Every beat carries exact event IDs, episode references and an `imageEpisodeNumber`; evidence IDs are resolved from the graph by the server.
- A cited event and its evidence must agree with the beat's episodes; the chosen image episode must also be one of those episodes.
- Exact duplicate source texts are removed. Official, licensed transcript and editorial tiers are already represented in the data model but require contracted adapters before they are populated.
- The central source registry records licence, attribution, ShareAlike, storage, transformation and commercial-use policy. `audit` mode reports unresolved rights; `enforce` mode blocks publication unless the reviewed provider ID is listed in `RECAP_SOURCE_APPROVALS`.
- Generated images use a real 9:19.5 cover crop with focal coordinates instead of being stretched.
- Canvas order is preserved for gradients, images, overlays and text groups.
- The public player renders generated story fields as responsive semantic HTML. Canvas remains the editable source and the fallback for manually-authored slides.
- Generated copy is never shortened with an ellipsis. Responsive density classes preserve the full text; content beyond the safe display limits fails the quality gate instead of being published partially.
- Text length influences type size and slide reading duration, up to 22 seconds for dense moments.
- Trakt images are requested with `extended=full` and served through the existing cached image proxy, as required by Trakt's image policy.

## Prompt compatibility

Custom prompts remain supported when they contain these variables:

- `{{seasonQuickFacts}}`
- `{{eventGraph}}`
- `{{targetBeatCount}}`

An incompatible active prompt is ignored and the versioned default prompt is used. The admin prompt page displays the missing variables.

## Deployment

1. Configure `TRAKT_CLIENT_ID`, `OPENAI_API_KEY` and optionally `OPENAI_RECAP_MODEL` in the server environment.
2. Optionally configure `TMDB_API_READ_ACCESS_TOKEN` or `TMDB_API_KEY`. Wikimedia enrichment is enabled by default and can be disabled with `RECAP_WIKIMEDIA_ENABLED=false`.
3. Keep `RECAP_SOURCE_POLICY_MODE=audit` in development. Confirm provider terms and commercial agreements, list the reviewed IDs in `RECAP_SOURCE_APPROVALS`, then use `enforce` before commercial launch.
4. Apply Supabase migrations with the normal deployment workflow.
5. Ensure the existing `image-proxy` Edge Function and `images` storage bucket are deployed.
6. Generate several known seasons and inspect the event graph, `quality_report`, costs, latency and slide readability before enabling the feature broadly.

## Known limits and next iterations

The current pipeline separates extraction from narration and verifies all identifiers, but it still does not semantically prove every sentence against the source text. Wikipedia availability varies widely and reference summaries can remain too short. The next quality tier should add:

- a separate verifier pass that checks each claim against cited episode sources;
- a licensed richer source where available (official summaries, subtitles or transcripts);
- an admin review queue for `needs_review`, with edit, approve and regenerate actions;
- a server-side worker or scheduled task so finalization no longer depends on browser polling;
- an evaluation dataset of known seasons, scored for factuality, chronology, coverage, readability and image relevance;
- multiple deterministic layout templates selected from content density and image composition.
