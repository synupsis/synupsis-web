# Recap generation pipeline

Synupsis generates one canonical French recap per season and format version. Existing manually-authored recaps remain valid; scene-backed generated recaps use format version `10`, told chapter by chapter (versions `4` to `9` stay readable; season cards open the newest published format).

## Current flow

1. An authenticated user requests a missing season recap.
2. The API reuses a published canonical recap or an active generation job when one exists.
3. Trakt supplies the baseline identity, episode metadata and artwork. TMDB and TVmaze add their episode synopses, which are mostly promotional teasers.
4. Wikidata resolves the show from its IMDb ID, then its season and episode items and their Wikipedia articles. Title patterns (`X season N`, `Saison N de X`, episode lists, series article) are the fallback. Wikipedia then supplies **one plot summary per episode**: rows of the season's episode table, `Résumé détaillé` blocks of French season articles, and the `Plot`/`Résumé` section of episode articles.
5. Every unique narrative fragment is captured in an immutable Evidence Pack with provider, language, trust tier, licence, retrieval time, revision and stable evidence ID. Plot summaries outrank teasers; each episode keeps at most four fragments.
6. **Source gate.** An episode is documented when its most detailed fragment reaches 400 characters (translations of the same teaser do not add up). Below 60 % of documented episodes, the job fails with `insufficient_sources` before any model call and the API answers `422` with an explanation.
7. **Scene extraction, one Structured Output call per episode, in parallel.** Each call receives only that episode's fragments and returns its scenes in order (up to ten, depending on the plot length): title, concrete action, location, memorable detail, characters, importance and a **verbatim quote** of 5 to 30 words with the ID of the fragment it comes from.
8. **Quote verification.** The server checks that every quote appears word for word in a fragment of the same episode (case and punctuation aside). A scene without a verifiable quote is rejected and listed in the graph's `verification` report.
9. **Critic and recovery.** One call lists, from the model's knowledge of the series, up to three major moments per episode that seem missing from the extracted scenes. These suggestions are never published: one recovery call per concerned episode searches them in that episode's sources and returns a scene only with verbatim quotes, checked like any other scene. Recovered scenes are placed after the scene they follow; suggestions the sources do not support are kept in `critic.unsupportedGaps` for review. A failed critic or recovery keeps the extracted scenes.
10. **Season linking.** One more call receives the verified scenes (never the sources) and only adds arcs, direct causes and consequences, and character aliases (`Ned` → `Eddard Stark`). Links to a scene revealed in a later episode are dropped. If this pass fails, the scenes are kept unlinked.
11. Synupsis validates the graph before continuing. Invalid evidence links, documented episodes missing from the timeline, less than 75 % of verified quotes or an undersized graph send the job to `needs_review`.
12. A story pass receives only the validated scenes (with their location and detail) and writes three parts: a cover, **« Épisode par épisode »** (for every episode, a headline, one-sentence moments citing scenes of that episode — one per critical or major scene, between 3 and 10 — and a **bilan**: deaths, lasting changes of situation and at most two open questions) and the **end of the season** (where 3 to 8 main characters stand, and 2 to 4 open questions). Every bilan and season-end line is a full sentence naming its character and citing its scenes; a bilan line only cites scenes of its episode. Evidence IDs are derived server-side. There are no season turning points any more (`beats` stays empty).
13. **Claim verification.** A separate pass receives the draft and the scenes it cites, checks every claim (character, action, place, cause, consequence, and the states a bilan asserts) and rewrites the texts that contain an unsupported claim or empty phrasing. A moment, bilan or season-end line with nothing exact left is removed. Corrections are recorded in `quality_report.claimVerification`; an unsupported claim that could not be rewritten blocks publication.
14. Synupsis validates critical-scene coverage, episode recap coverage (every episode of the timeline needs its slide), chronology references, evidence coverage, source richness, causal integrity, source-rights readiness, **empty phrasing** (a fixed list such as « tout bascule », « les tensions montent ») **specificity** (at least 70 % of the narrations and moments name a character of the scenes they cite) **critical-scene coverage** (at least 90 % of the `critical` scenes are told in their own chapter) and the **season end** (at least 3 characters).
15. A passing story is planned deterministically (`planStorySlides`): the cover, then one chapter per episode — a card, each decisive moment on its own slide, the other moments two by two, then « Ce qui a changé » (five lines a slide) — and finally « Où en est-on » (four characters a slide), « Morts cette saison » (gathered from the bilans) and « Questions ouvertes ». The plan becomes ordered Konva nodes, published atomically with the Evidence Pack, scene graph, slides and reports; the player rebuilds the same plan to render each slide, with a progress bar per chapter and an episode rail. The plan, not the stored rows, decides the slides: a recap stored before a change of the plan still shows every slide. Each slide of a chapter gets its own image: the episode's TMDB stills (best rated, text-free first), then the show's TMDB backdrops, which also dress the end of the season. While the sources are collected, a vision model locates the main face (or subject) of each TMDB image, eight low-resolution images per call, without identifying anyone; slides keep that point in frame when they crop. The cover is a title card over the season poster (a TMDB poster without text first) with the show's title logo (French, else English); both are looked up when the recap is read and cached for a week, so older recaps get them too. Characters show their TVmaze portrait (character image, else actor), matched under any of their aliases, with the initials as fallback. Trakt images go through the image proxy as its policy requires; TMDB and TVmaze images load from their own CDNs.
16. A low-confidence story is kept as `needs_review` and is never shown as a published recap.

A server worker (`server/plugins/recap-generation-worker.ts`) advances every running job each 4 seconds (`server/services/recap-generation-runner.ts`), so a recap keeps progressing when its page is refreshed or closed; `RECAP_GENERATION_WORKER=false` turns it off and leaves the advance to browser polls, which call the same code. Calls for one job within a process share one advance, and `updated_at` guards let a single caller win each transition across processes. During extraction, the pending episode responses are checked at most every 4 seconds and finished ones are stored in `extraction_results`; the last one triggers assembly and linking. A job still active 30 minutes after it was created is expired, so it cannot block its season.

Several seasons can generate at once, one job per season. On load, the show page lists the running jobs of the show (`GET /api/recap/generation/active`) and follows each of them; a finished recap is announced with a toast instead of leaving the page. Each stage has a progress range (`lib/recap-generation-progress.ts`): the job stores the floor of the stage it enters (or the share of episodes extracted), a trigger records `stage_started_at`, and the browser eases the ring towards the stage's ceiling from that time, measured on the server clock, so a refresh or another viewer shows the same percentage.

OpenAI calls are direct streamed requests, not background mode, whose queue once held requests for hours. The stream keeps running in the server process after the job stores its response id, and polls read the result from memory (`server/services/openai-streamed-responses.ts`). This needs a long-lived server process: after a restart, or from another process, a response is retrieved from OpenAI instead. OpenAI answers `404` while the response is still streaming elsewhere: it then counts as in progress, the process holding the stream collects it, and a job whose stream was cut off expires after the 30 minutes above.

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
- `{{episodeMomentTargets}}`

An incompatible active prompt is ignored and the versioned default prompt is used: a prompt written for the season turning points of format 9 (`{{targetBeatCount}}`) is one. The admin prompt page displays the missing variables. Chapters stories (format 10) are edited as canvases only in the recap editor.

## Deployment

1. Configure `TRAKT_CLIENT_ID`, `OPENAI_API_KEY` and optionally `OPENAI_RECAP_MODEL` in the server environment.
2. Optionally configure `TMDB_API_READ_ACCESS_TOKEN` or `TMDB_API_KEY`. Wikimedia enrichment is enabled by default and can be disabled with `RECAP_WIKIMEDIA_ENABLED=false`.
3. Keep `RECAP_SOURCE_POLICY_MODE=audit` in development. Confirm provider terms and commercial agreements, list the reviewed IDs in `RECAP_SOURCE_APPROVALS`, then use `enforce` before commercial launch.
4. Apply Supabase migrations with the normal deployment workflow.
5. Generate several known seasons and inspect the event graph, `quality_report`, costs, latency and slide readability before enabling the feature broadly.

## Known limits and next iterations

The current pipeline separates extraction from narration and verifies all identifiers, but it still does not semantically prove every sentence against the source text. Wikipedia coverage varies widely: recent or less popular seasons often have no episode summaries yet, and the source gate then refuses the recap instead of publishing a vague one. Wikipedia is fetched again for every generation (about 10 to 30 requests per season); caching documents by revision is the next step. The next quality tier should add:

- a separate verifier pass that checks each claim against cited episode sources;
- a licensed richer source where available (official summaries, subtitles or transcripts);
- an admin review queue for `needs_review`, with edit, approve and regenerate actions;
- an evaluation dataset of known seasons, scored for factuality, chronology, coverage, readability and image relevance;
- multiple deterministic layout templates selected from content density and image composition.
