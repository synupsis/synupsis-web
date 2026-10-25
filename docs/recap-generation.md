# Recap generation pipeline

Synupsis generates one canonical French recap per season and format version. Existing manually-authored recaps remain valid; scene-backed generated recaps use format version `7` (versions `4` to `6` stay readable; season cards open the newest published format).

## Current flow

1. An authenticated user requests a missing season recap.
2. The API reuses a published canonical recap or an active generation job when one exists.
3. Trakt supplies the baseline identity, episode metadata and artwork. TMDB and TVmaze add their episode synopses, which are mostly promotional teasers.
4. Wikidata resolves the show from its IMDb ID, then its season and episode items and their Wikipedia articles. Title patterns (`X season N`, `Saison N de X`, episode lists, series article) are the fallback. Wikipedia then supplies **one plot summary per episode**: rows of the season's episode table, `Résumé détaillé` blocks of French season articles, and the `Plot`/`Résumé` section of episode articles.
5. Every unique narrative fragment is captured in an immutable Evidence Pack with provider, language, trust tier, licence, retrieval time, revision and stable evidence ID. Plot summaries outrank teasers; each episode keeps at most four fragments.
6. **Source gate.** An episode is documented when its most detailed fragment reaches 400 characters (translations of the same teaser do not add up). Below 60 % of documented episodes, the job fails with `insufficient_sources` before any model call and the API answers `422` with an explanation.
7. **Scene extraction, one Structured Output call per episode, in parallel.** Each call receives only that episode's fragments and returns its scenes in order (up to ten, depending on the plot length): title, concrete action, location, memorable detail, characters, importance and a **verbatim quote** of 5 to 30 words with the ID of the fragment it comes from.
8. **Quote verification.** The server checks that every quote appears word for word in a fragment of the same episode (case and punctuation aside). A scene without a verifiable quote is rejected and listed in the graph's `verification` report.
9. **Season linking.** One more call receives the verified scenes (never the sources) and only adds arcs, direct causes and consequences, and character aliases (`Ned` → `Eddard Stark`). Links to a scene revealed in a later episode are dropped. If this pass fails, the scenes are kept unlinked.
10. Synupsis validates the graph before continuing. Invalid evidence links, documented episodes missing from the timeline, less than 75 % of verified quotes or an undersized graph send the job to `needs_review`.
11. A story pass receives only the validated scenes (with their location and detail) and writes three parts: a cover, **« L'essentiel »** (5–8 chronological turning points that cite scene IDs) and **« Épisode par épisode »** (for every episode, a headline and 3 to 5 one-sentence moments citing scenes of that episode). Evidence IDs are derived server-side. The story has to cite the `critical` scenes.
12. **Claim verification.** A separate pass receives the draft and the scenes it cites, checks every claim (character, action, place, cause, consequence) and rewrites the texts that contain an unsupported claim or empty phrasing. A moment with nothing exact left is removed. Corrections are recorded in `quality_report.claimVerification`; an unsupported claim that could not be rewritten blocks publication.
13. Synupsis validates critical-scene coverage, episode recap coverage (every episode of the timeline needs its slide), chronology references, evidence coverage, source richness, causal integrity, source-rights readiness, **empty phrasing** (a fixed list such as « tout bascule », « les tensions montent ») and **specificity** (at least 70 % of the narrations and moments name a character of the scenes they cite).
14. A passing story is converted deterministically into ordered Konva nodes (cover, turning points, then one slide per episode) and published atomically with its Evidence Pack, scene graph, slides and reports.
15. A low-confidence story is kept as `needs_review` and is never shown as a published recap.

The browser polls the generation job and completes publication for this first version. During extraction, each poll checks the pending episode responses at most every 4 seconds and stores finished ones in `extraction_results`; the last one triggers assembly and linking. A stale active job is expired after 30 minutes, so it cannot block future requests indefinitely.

## Evaluation

`evals/recap/must-have-scenes.json` lists, per season, the scenes a viewer must find again (3 to 5 per episode). `yarn eval:recaps` loads the latest published recap of each season (or `--format-version N`), asks a judge model which of these scenes appear in the timeline and in the recap of the same episode, and prints both recalls (`--out report.json` keeps the details). Seasons marked `draft` must be reviewed by a person before their numbers are trusted; empty lists are skipped.

## Data and rendering rules

- Each extraction call receives only the requested show, season and the fragments of one episode. The linking and writing models receive only the verified scenes, never the source text. All prompts forbid model memory and future-season information.
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

The current pipeline separates extraction from narration and verifies all identifiers, but it still does not semantically prove every sentence against the source text. Wikipedia coverage varies widely: recent or less popular seasons often have no episode summaries yet, and the source gate then refuses the recap instead of publishing a vague one. Wikipedia is fetched again for every generation (about 10 to 30 requests per season); caching documents by revision is the next step. The next quality tier should add:

- a separate verifier pass that checks each claim against cited episode sources;
- a licensed richer source where available (official summaries, subtitles or transcripts);
- an admin review queue for `needs_review`, with edit, approve and regenerate actions;
- a server-side worker or scheduled task so finalization no longer depends on browser polling;
- an evaluation dataset of known seasons, scored for factuality, chronology, coverage, readability and image relevance;
- multiple deterministic layout templates selected from content density and image composition.
