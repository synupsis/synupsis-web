import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '~/types/database.types';
import type { RecapStory } from '~/types/recap-story.types';
import type {
  RecapCriticGap,
  RecapEventGraph,
  RecapSourceSnapshot,
} from '~/server/services/recap-generation/types';
import {
  retrieveRecapGeneration,
  startRecapGeneration,
  startSceneCritic,
  startSceneLinking,
  startSceneRecovery,
  startStoryVerification,
} from '~/server/services/recap-generation/openai';
import {
  createRecapPrompt,
  createSceneCriticPrompt,
  createSceneLinkingPrompt,
  createSceneRecoveryPrompt,
} from '~/server/services/recap-generation/prompts';
import {
  applyRecoveredScenes,
  applySceneLinks,
  assembleSceneGraph,
  evaluateRecapEventGraph,
  parseCriticGaps,
} from '~/server/services/recap-generation/scene-graph';
import { finalizeRecapStory, processRecapDraft } from '~/server/services/recap-generation/story';
import { createStoryVerificationPrompt } from '~/server/services/recap-story-quality';
import {
  RECAP_GENERATION_ACTIVE_STATUSES,
  RECAP_GENERATION_TERMINAL_STATUSES,
  getRecapGenerationProgress,
} from '~/lib/recap-generation-progress';

/**
 * Advances recap generation jobs one step at a time. Browser polls and the
 * server worker (server/plugins/recap-generation-worker.ts) both call it: the
 * updated_at guards let a single caller win each transition across processes,
 * and calls for the same job within this process share one advance.
 */

// Each check queries one provider response per episode: space them out.
const EXTRACTION_POLL_INTERVAL_MS = 4_000;
const ACTIVE_JOB_TIMEOUT_MS = 30 * 60 * 1_000;
// The worker advances a bounded number of jobs per tick.
const WORKER_BATCH_SIZE = 20;

type ServiceClient = SupabaseClient<Database>;
type JobRow = Database['public']['Tables']['recap_generation_job']['Row'];
type ExtractionResult = { status: 'completed'; text: string } | { status: 'failed'; error: string };
export type PublicRecapGenerationJob = ReturnType<typeof toPublicJob>;

const advancingJobs = new Map<string, Promise<PublicRecapGenerationJob | null>>();

export function advanceRecapGenerationJob(service: ServiceClient, jobId: string) {
  const pending = advancingJobs.get(jobId);
  if (pending) return pending;
  const advance = advanceJob(service, jobId).finally(() => advancingJobs.delete(jobId));
  advancingJobs.set(jobId, advance);
  return advance;
}

/** Called by the server worker: expires stale jobs, then advances the running ones. */
export async function advanceActiveRecapGenerationJobs(service: ServiceClient) {
  await expireStaleRecapGenerationJobs(service);
  const { data, error } = await service
    .from('recap_generation_job')
    .select('id')
    .eq('status', 'generating')
    .order('created_at', { ascending: true })
    .limit(WORKER_BATCH_SIZE);
  if (error) throw error;
  await Promise.all((data ?? []).map(async (job) => {
    try {
      await advanceRecapGenerationJob(service, job.id);
    } catch (cause) {
      console.error(`The worker could not advance recap generation job ${job.id}:`, cause);
    }
  }));
}

/** A job still active 30 minutes after it started will not finish: free its season. */
export async function expireStaleRecapGenerationJobs(service: ServiceClient) {
  const now = new Date();
  const { error } = await service
    .from('recap_generation_job')
    .update({
      status: 'failed',
      progress: 100,
      error_code: 'generation_job_expired',
      error_message: 'The generation job did not complete within 30 minutes.',
      completed_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .in('status', RECAP_GENERATION_ACTIVE_STATUSES)
    .lt('created_at', new Date(now.getTime() - ACTIVE_JOB_TIMEOUT_MS).toISOString());
  if (error) throw error;
}

async function advanceJob(service: ServiceClient, jobId: string) {
  const { data: job, error: jobError } = await service
    .from('recap_generation_job')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (jobError) throw jobError;
  if (!job) return null;

  if (RECAP_GENERATION_TERMINAL_STATUSES.includes(job.status)) {
    return toPublicJob(job);
  }

  if (job.status === 'generating' && job.generation_phase === 'preparing_story') {
    const retryAfterMs = 20_000;
    if (Date.now() - new Date(job.updated_at).getTime() < retryAfterMs) {
      return toPublicJob(job);
    }
    const { data: recoveredJob, error: recoveryError } = await service
      .from('recap_generation_job')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('status', 'generating')
      .eq('generation_phase', 'preparing_story')
      .eq('updated_at', job.updated_at)
      .select('*')
      .maybeSingle();
    if (recoveryError) throw recoveryError;
    return recoveredJob
      ? await startStoryPhase(service, recoveredJob)
      : toPublicJob(job);
  }

  if (job.status === 'generating' && ['extracting_events', 'recovering_events'].includes(job.generation_phase)) {
    try {
      return await collectEpisodeResponses(service, job);
    } catch (error) {
      console.error(`Failed to collect scene extractions for job ${job.id}:`, error);
      const message = error instanceof Error ? error.message : 'Could not collect the episode extractions.';
      return await failJob(service, job.id, 'scene_extraction_failed', message);
    }
  }

  if (job.status !== 'generating' || !job.provider_response_id) {
    return toPublicJob(job);
  }

  try {
    const response = await retrieveRecapGeneration(job.provider_response_id);
    // The browser eases the bar within the stage from stage_started_at.
    if (response.status === 'queued' || response.status === 'in_progress') {
      return toPublicJob(job);
    }

    if (job.generation_phase === 'critiquing_events') {
      const snapshot = parseSourceSnapshot(job.source_snapshot);
      const eventGraph = parseEventGraph(job.event_graph);
      let gaps: RecapCriticGap[] = [];
      if (response.status === 'completed') {
        try {
          gaps = parseCriticGaps(response.output_text, snapshot);
        } catch (error) {
          console.warn(`Critic output of job ${job.id} is unusable; linking the extracted scenes.`, error);
        }
      }
      if (!gaps.length) {
        return await startLinkingPhase(
          service,
          job,
          snapshot,
          withCritic(eventGraph, response.status === 'completed' ? 'completed' : 'failed'),
        );
      }
      return await startRecoveryPhase(service, job, snapshot, eventGraph, gaps);
    }

    if (job.generation_phase === 'linking_events') {
      // Links only add arcs, causes and aliases: a failed pass keeps the verified scenes.
      const snapshot = parseSourceSnapshot(job.source_snapshot);
      const eventGraph = parseEventGraph(job.event_graph);
      let linkedGraph: RecapEventGraph = { ...eventGraph, linking: 'failed' };
      if (response.status === 'completed') {
        try {
          linkedGraph = applySceneLinks(eventGraph, response.output_text);
        } catch (error) {
          console.warn(`Scene links of job ${job.id} are unusable; keeping unlinked scenes.`, error);
        }
      }
      return await finishEventGraph(service, job, snapshot, linkedGraph);
    }

    if (response.status !== 'completed') {
      const providerError = response.error?.message || `OpenAI response ended with status ${response.status}.`;
      // An unverified story is never published.
      const errorCode = job.generation_phase === 'verifying_story' ? 'story_verification_failed' : 'provider_response_failed';
      return await failJob(service, job.id, errorCode, providerError);
    }

    if (job.generation_phase === 'writing_story') {
      return await startVerificationPhase(service, job, response.output_text);
    }

    // Claim finalization. If another poll request already claimed it, this
    // request simply returns the latest persisted state.
    const { data: claimedJob } = await service
      .from('recap_generation_job')
      .update({ status: 'validating', progress: getRecapGenerationProgress('validating'), updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('status', 'generating')
      .eq('generation_phase', 'verifying_story')
      .select('id')
      .maybeSingle();

    if (!claimedJob) {
      const { data: latestJob } = await service
        .from('recap_generation_job')
        .select('*')
        .eq('id', job.id)
        .single();
      return latestJob ? toPublicJob(latestJob) : toPublicJob(job);
    }

    const snapshot = parseSourceSnapshot(job.source_snapshot);
    const eventGraph = parseEventGraph(job.event_graph);
    const draft = parseStoryDraft(job.story_data);
    const { story, quality, slides } = finalizeRecapStory(draft, response.output_text, snapshot, eventGraph);

    if (!quality.publishable) {
      const { data: reviewJob, error: reviewError } = await service
        .from('recap_generation_job')
        .update({
          status: 'needs_review',
          progress: 100,
          story_data: story as unknown as Json,
          quality_report: quality as unknown as Json,
          error_code: 'quality_gate_failed',
          error_message: `Quality gate failed: ${quality.issues.join(', ')}`,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)
        .select('*')
        .single();
      if (reviewError || !reviewJob) throw reviewError;
      return toPublicJob(reviewJob);
    }

    await service
      .from('recap_generation_job')
      .update({ status: 'rendering', progress: getRecapGenerationProgress('rendering'), updated_at: new Date().toISOString() })
      .eq('id', job.id);

    const { data: recapId, error: publishError } = await service.rpc('publish_generated_recap', {
      p_show_id: job.show_id,
      p_season_id: job.season_id,
      p_locale: job.locale,
      p_format_version: job.format_version,
      p_source_snapshot: snapshot as unknown as Json,
      p_event_graph: eventGraph as unknown as Json,
      p_story_data: story as unknown as Json,
      p_quality_report: quality as unknown as Json,
      p_prompt_id: job.prompt_id,
      p_model: job.model,
      p_prompt_version: job.prompt_version,
      p_slides: slides as unknown as Json,
    });
    if (publishError || !recapId) {
      throw publishError || new Error('The generated recap could not be published.');
    }

    const { data: completedJob, error: completedError } = await service
      .from('recap_generation_job')
      .update({
        status: 'completed',
        progress: 100,
        recap_id: recapId,
        event_graph: eventGraph as unknown as Json,
        story_data: story as unknown as Json,
        quality_report: quality as unknown as Json,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .select('*')
      .single();
    if (completedError || !completedJob) throw completedError;

    return toPublicJob(completedJob);
  } catch (error) {
    console.error(`Failed to finalize recap generation job ${job.id}:`, error);
    const message = error instanceof Error ? error.message : 'Unknown generation finalization error.';
    return await failJob(service, job.id, 'generation_finalize_failed', message);
  }
}

// Collects one provider response per episode: scene extraction, then the
// critic's recovery searches.
async function collectEpisodeResponses(
  service: ServiceClient,
  job: JobRow,
) {
  const responses = toStringRecord(job.extraction_responses);
  const episodeNumbers = Object.keys(responses);
  if (!episodeNumbers.length) throw new Error('The generation job has no episode extraction.');
  if (Date.now() - new Date(job.updated_at).getTime() < EXTRACTION_POLL_INTERVAL_MS) {
    return toPublicJob(job);
  }

  const results = toExtractionResults(job.extraction_results);
  await Promise.all(episodeNumbers.filter(episode => !results[episode]).map(async (episode) => {
    const response = await retrieveRecapGeneration(responses[episode] as string);
    if (response.status === 'queued' || response.status === 'in_progress') return;
    results[episode] = response.status === 'completed'
      ? { status: 'completed', text: response.output_text }
      : { status: 'failed', error: response.error?.message || response.incomplete_details?.reason || String(response.status) };
  }));

  const completedCount = episodeNumbers.filter(episode => results[episode]).length;
  if (completedCount < episodeNumbers.length) {
    // The updated_at guard keeps a concurrent poll from overwriting newer results.
    const { data: updatedJob, error } = await service
      .from('recap_generation_job')
      .update({
        extraction_results: results as unknown as Json,
        progress: getRecapGenerationProgress(
          job.generation_phase === 'recovering_events' ? 'recovering_events' : 'extracting_events',
          completedCount / episodeNumbers.length,
        ),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'generating')
      .eq('generation_phase', job.generation_phase)
      .eq('updated_at', job.updated_at)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return toPublicJob(updatedJob ?? job);
  }

  const snapshot = parseSourceSnapshot(job.source_snapshot);
  const outputs = new Map(episodeNumbers.map((episode) => {
    const result = results[episode];
    return [Number(episode), result?.status === 'completed' ? result.text : null] as const;
  }));

  if (job.generation_phase === 'recovering_events') {
    const eventGraph = applyRecoveredScenes(snapshot, parseEventGraph(job.event_graph), outputs);
    return await startLinkingPhase(service, job, snapshot, eventGraph, { extraction_results: results as unknown as Json });
  }

  const eventGraph = assembleSceneGraph(snapshot, outputs);
  return await startSingleResponsePhase(service, job, {
    phase: 'critiquing_events',
    eventGraph,
    extraUpdate: { extraction_results: results as unknown as Json },
    start: claimedJob => startSceneCritic({
      prompt: createSceneCriticPrompt(snapshot, eventGraph),
      model: claimedJob.model,
      jobId: claimedJob.id,
    }),
    // The critic only improves recall: without it, the verified scenes go on to linking.
    onStartFailure: claimedJob => startLinkingPhase(service, claimedJob, snapshot, withCritic(eventGraph, 'failed')),
  });
}

/**
 * Claims the next phase (guarded by updated_at so a single poll wins), then
 * starts its provider response.
 */
async function startSingleResponsePhase(
  service: ServiceClient,
  job: JobRow,
  input: {
    phase: 'critiquing_events' | 'linking_events';
    eventGraph: RecapEventGraph;
    extraUpdate?: Database['public']['Tables']['recap_generation_job']['Update'];
    start: (claimedJob: JobRow) => Promise<{ id: string }>;
    onStartFailure: (claimedJob: JobRow) => Promise<ReturnType<typeof toPublicJob>>;
  },
) {
  const { data: claimedJob, error: claimError } = await service
    .from('recap_generation_job')
    .update({
      ...input.extraUpdate,
      generation_phase: input.phase,
      provider_response_id: null,
      progress: getRecapGenerationProgress(input.phase),
      event_graph: input.eventGraph as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)
    .eq('status', 'generating')
    .eq('generation_phase', job.generation_phase)
    .eq('updated_at', job.updated_at)
    .select('*')
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimedJob) return toPublicJob(job);

  try {
    const providerResponse = await input.start(claimedJob);
    const { data: waitingJob, error } = await service
      .from('recap_generation_job')
      .update({ provider_response_id: providerResponse.id, updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('generation_phase', input.phase)
      .is('provider_response_id', null)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return toPublicJob(waitingJob ?? claimedJob);
  } catch (error) {
    console.warn(`The ${input.phase} phase could not start for job ${job.id}.`, error);
    return await input.onStartFailure(claimedJob);
  }
}

function startLinkingPhase(
  service: ServiceClient,
  job: JobRow,
  snapshot: RecapSourceSnapshot,
  eventGraph: RecapEventGraph,
  extraUpdate?: Database['public']['Tables']['recap_generation_job']['Update'],
) {
  return startSingleResponsePhase(service, job, {
    phase: 'linking_events',
    eventGraph,
    extraUpdate,
    start: claimedJob => startSceneLinking({
      prompt: createSceneLinkingPrompt(snapshot, eventGraph),
      model: claimedJob.model,
      jobId: claimedJob.id,
    }),
    onStartFailure: claimedJob => finishEventGraph(service, claimedJob, snapshot, { ...eventGraph, linking: 'failed' }),
  });
}

async function startRecoveryPhase(
  service: ServiceClient,
  job: JobRow,
  snapshot: RecapSourceSnapshot,
  eventGraph: RecapEventGraph,
  gaps: RecapCriticGap[],
) {
  // Lease: only the poll that bumps updated_at starts the recovery responses.
  const { data: leasedJob, error: leaseError } = await service
    .from('recap_generation_job')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', job.id)
    .eq('status', 'generating')
    .eq('generation_phase', 'critiquing_events')
    .eq('updated_at', job.updated_at)
    .select('*')
    .maybeSingle();
  if (leaseError) throw leaseError;
  if (!leasedJob) return toPublicJob(job);

  const pendingGraph: RecapEventGraph = {
    ...eventGraph,
    critic: { status: 'pending', gaps, recoveredScenes: 0, unsupportedGaps: [] },
  };
  try {
    const recoveryResponses = Object.fromEntries(await Promise.all(
      snapshot.episodes
        .filter(episode => gaps.some(gap => gap.episodeNumber === episode.number))
        .map(async (episode) => {
          const providerResponse = await startSceneRecovery({
            prompt: createSceneRecoveryPrompt(snapshot, episode, pendingGraph, gaps.filter(gap => gap.episodeNumber === episode.number)),
            model: leasedJob.model,
            jobId: leasedJob.id,
            episodeNumber: episode.number,
          });
          return [String(episode.number), providerResponse.id] as const;
        }),
    ));
    const { data: recoveringJob, error } = await service
      .from('recap_generation_job')
      .update({
        generation_phase: 'recovering_events',
        provider_response_id: null,
        extraction_responses: recoveryResponses,
        extraction_results: {},
        event_graph: pendingGraph as unknown as Json,
        progress: getRecapGenerationProgress('recovering_events'),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('generation_phase', 'critiquing_events')
      .eq('updated_at', leasedJob.updated_at)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return toPublicJob(recoveringJob ?? leasedJob);
  } catch (error) {
    console.warn(`Scene recovery could not start for job ${job.id}; linking the extracted scenes.`, error);
    return await startLinkingPhase(service, leasedJob, snapshot, withCritic(eventGraph, 'failed', gaps));
  }
}

function withCritic(
  eventGraph: RecapEventGraph,
  status: 'completed' | 'failed',
  gaps: RecapCriticGap[] = [],
): RecapEventGraph {
  return { ...eventGraph, critic: { status, gaps, recoveredScenes: 0, unsupportedGaps: gaps } };
}

async function startVerificationPhase(
  service: ServiceClient,
  job: JobRow,
  draftText: string,
) {
  const snapshot = parseSourceSnapshot(job.source_snapshot);
  const eventGraph = parseEventGraph(job.event_graph);
  const draft = processRecapDraft(draftText, snapshot, eventGraph);
  const { data: verifyingJob, error: claimError } = await service
    .from('recap_generation_job')
    .update({
      generation_phase: 'verifying_story',
      provider_response_id: null,
      story_data: draft as unknown as Json,
      progress: getRecapGenerationProgress('verifying_story'),
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)
    .eq('status', 'generating')
    .eq('generation_phase', 'writing_story')
    .eq('provider_response_id', job.provider_response_id as string)
    .select('*')
    .maybeSingle();
  if (claimError) throw claimError;
  if (!verifyingJob) return toPublicJob(job);

  try {
    const providerResponse = await startStoryVerification({
      prompt: createStoryVerificationPrompt(draft, eventGraph),
      model: verifyingJob.model,
      jobId: verifyingJob.id,
    });
    const { data: waitingJob, error } = await service
      .from('recap_generation_job')
      .update({ provider_response_id: providerResponse.id, updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('generation_phase', 'verifying_story')
      .is('provider_response_id', null)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return toPublicJob(waitingJob ?? verifyingJob);
  } catch (error) {
    console.error(`Story verification could not start for job ${job.id}:`, error);
    const message = error instanceof Error ? error.message : 'Could not start the story verification.';
    return await failJob(service, job.id, 'story_verification_start_failed', message);
  }
}

async function finishEventGraph(
  service: ServiceClient,
  job: JobRow,
  snapshot: RecapSourceSnapshot,
  eventGraph: RecapEventGraph,
) {
  const quality = evaluateRecapEventGraph(eventGraph, snapshot);
  const now = new Date().toISOString();

  if (!quality.publishable) {
    const { data: reviewJob, error: reviewError } = await service
      .from('recap_generation_job')
      .update({
        status: 'needs_review',
        progress: 100,
        event_graph: eventGraph as unknown as Json,
        quality_report: { stage: 'event_graph', ...quality } as unknown as Json,
        error_code: 'event_quality_gate_failed',
        error_message: `Event quality gate failed: ${quality.issues.join(', ')}`,
        completed_at: now,
        updated_at: now,
      })
      .eq('id', job.id)
      .eq('status', 'generating')
      .eq('generation_phase', 'linking_events')
      .select('*')
      .maybeSingle();
    if (reviewError) throw reviewError;
    return toPublicJob(reviewJob ?? job);
  }

  const { data: claimedEventJob, error: claimError } = await service
    .from('recap_generation_job')
    .update({
      generation_phase: 'preparing_story',
      progress: getRecapGenerationProgress('preparing_story'),
      event_graph: eventGraph as unknown as Json,
      quality_report: { stage: 'event_graph', ...quality } as unknown as Json,
      updated_at: now,
    })
    .eq('id', job.id)
    .eq('status', 'generating')
    .eq('generation_phase', 'linking_events')
    .select('*')
    .maybeSingle();
  if (claimError) throw claimError;
  return claimedEventJob
    ? await startStoryPhase(service, claimedEventJob)
    : toPublicJob(job);
}

async function startStoryPhase(
  service: ServiceClient,
  job: JobRow,
) {
  try {
    const snapshot = parseSourceSnapshot(job.source_snapshot);
    const eventGraph = parseEventGraph(job.event_graph);
    const template = typeof job.prompt_template === 'string' && job.prompt_template.trim()
      ? job.prompt_template
      : undefined;
    const prompt = createRecapPrompt(snapshot, eventGraph, template);
    const providerResponse = await startRecapGeneration({
      prompt,
      model: job.model,
      jobId: job.id,
    });
    const { data: writingJob, error } = await service
      .from('recap_generation_job')
      .update({
        generation_phase: 'writing_story',
        provider_response_id: providerResponse.id,
        progress: getRecapGenerationProgress('writing_story'),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'generating')
      .eq('generation_phase', 'preparing_story')
      .eq('updated_at', job.updated_at)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (writingJob) return toPublicJob(writingJob);

    // A newer lease won while this provider request was in flight. Its result
    // is authoritative; this response can safely be left orphaned at OpenAI.
    const { data: latestJob } = await service
      .from('recap_generation_job')
      .select('*')
      .eq('id', job.id)
      .single();
    return latestJob ? toPublicJob(latestJob) : toPublicJob(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start story generation.';
    console.error(`Failed to start story generation for job ${job.id}:`, error);
    const completedAt = new Date().toISOString();
    const { data: failedJob } = await service
      .from('recap_generation_job')
      .update({
        status: 'failed',
        progress: 100,
        error_code: 'story_generation_start_failed',
        error_message: message,
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq('id', job.id)
      .eq('status', 'generating')
      .eq('generation_phase', 'preparing_story')
      .eq('updated_at', job.updated_at)
      .select('*')
      .maybeSingle();
    if (failedJob) return toPublicJob(failedJob);

    const { data: latestJob } = await service
      .from('recap_generation_job')
      .select('*')
      .eq('id', job.id)
      .single();
    return latestJob ? toPublicJob(latestJob) : toPublicJob(job);
  }
}

function parseSourceSnapshot(value: Json | null): RecapSourceSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The generation source snapshot is missing.');
  }
  const snapshot = value as unknown as RecapSourceSnapshot;
  if (!snapshot.show?.name || !snapshot.season?.number || !Array.isArray(snapshot.episodes)) {
    throw new Error('The generation source snapshot is invalid.');
  }
  return snapshot;
}

function parseStoryDraft(value: Json | null): RecapStory {
  const story = value && typeof value === 'object' && !Array.isArray(value)
    ? value as unknown as RecapStory
    : null;
  if (!story?.cover || !Array.isArray(story.beats)) {
    throw new Error('The story draft awaiting verification is missing.');
  }
  return story;
}

function toStringRecord(value: Json | null): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function toExtractionResults(value: Json | null): Record<string, ExtractionResult> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as unknown as Record<string, ExtractionResult>) };
}

function parseEventGraph(value: Json | null): RecapEventGraph {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The generation event graph is missing.');
  }
  const eventGraph = value as unknown as RecapEventGraph;
  if (!Array.isArray(eventGraph.events) || eventGraph.events.length < 3) {
    throw new Error('The generation event graph is invalid.');
  }
  return eventGraph;
}

async function failJob(
  service: ServiceClient,
  jobId: string,
  errorCode: string,
  errorMessage: string,
) {
  const { data } = await service
    .from('recap_generation_job')
    .update({
      status: 'failed',
      progress: 100,
      error_code: errorCode,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .select('*')
    .single();

  if (!data) throw new Error(`Recap generation job ${jobId} could not be marked as failed (${errorCode}): ${errorMessage}`);
  return toPublicJob(data);
}

export function toPublicJob(job: JobRow) {
  return {
    id: job.id,
    seasonId: job.season_id,
    status: job.status,
    phase: job.generation_phase,
    progress: job.progress,
    recapId: job.recap_id,
    errorCode: job.error_code,
    errorMessage: job.error_message,
    qualityReport: job.quality_report,
    // The browser measures the stage's elapsed time against the server clock.
    stageStartedAt: job.stage_started_at ?? job.updated_at,
    serverNow: new Date().toISOString(),
  };
}
