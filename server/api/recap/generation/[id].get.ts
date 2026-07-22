import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from '#supabase/server';
import type { Database, Json } from '~/types/database.types';
import type {
  RecapEventGraph,
  RecapSourceSnapshot,
} from '~/server/services/recap-generation';
import {
  createRecapPrompt,
  processRecapResponse,
  processEventGraphResponse,
  retrieveRecapGeneration,
  startRecapGeneration,
} from '~/server/services/recap-generation';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'needs_review']);

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication is required.' });
  }

  const jobId = event.context.params?.id;
  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: 'Generation job ID is required.' });
  }

  const service = serverSupabaseServiceRole<Database>(event);
  const { data: job, error: jobError } = await service
    .from('recap_generation_job')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    throw createError({ statusCode: 404, statusMessage: 'Generation job not found.' });
  }

  if (TERMINAL_STATUSES.has(job.status)) {
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

  if (job.status !== 'generating' || !job.provider_response_id) {
    return toPublicJob(job);
  }

  try {
    const response = await retrieveRecapGeneration(job.provider_response_id);
    if (response.status === 'queued' || response.status === 'in_progress') {
      const pendingProgress = job.generation_phase === 'extracting_events' ? 45 : 65;
      if (job.progress < pendingProgress) {
        await service
          .from('recap_generation_job')
          .update({ progress: pendingProgress, updated_at: new Date().toISOString() })
          .eq('id', job.id)
          .eq('status', 'generating');
      }
      return { ...toPublicJob(job), progress: Math.max(job.progress, pendingProgress) };
    }

    if (response.status !== 'completed') {
      const providerError = response.error?.message || `OpenAI response ended with status ${response.status}.`;
      return await failJob(service, job.id, 'provider_response_failed', providerError);
    }

    if (job.generation_phase === 'extracting_events') {
      const snapshot = parseSourceSnapshot(job.source_snapshot);
      const { eventGraph, quality } = processEventGraphResponse(response.output_text, snapshot);

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
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)
          .eq('status', 'generating')
          .eq('generation_phase', 'extracting_events')
          .select('*')
          .maybeSingle();
        if (reviewError) throw reviewError;
        return reviewJob ? toPublicJob(reviewJob) : toPublicJob(job);
      }

      const { data: claimedEventJob, error: claimError } = await service
        .from('recap_generation_job')
        .update({
          generation_phase: 'preparing_story',
          progress: 52,
          event_graph: eventGraph as unknown as Json,
          quality_report: { stage: 'event_graph', ...quality } as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)
        .eq('status', 'generating')
        .eq('generation_phase', 'extracting_events')
        .select('*')
        .maybeSingle();
      if (claimError) throw claimError;
      return claimedEventJob
        ? await startStoryPhase(service, claimedEventJob)
        : toPublicJob(job);
    }

    // Claim finalization. If another poll request already claimed it, this
    // request simply returns the latest persisted state.
    const { data: claimedJob } = await service
      .from('recap_generation_job')
      .update({ status: 'validating', progress: 70, updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('status', 'generating')
      .eq('generation_phase', 'writing_story')
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
    const { story, quality, slides } = processRecapResponse(response.output_text, snapshot, eventGraph);

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
      .update({ status: 'rendering', progress: 85, updated_at: new Date().toISOString() })
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
});

async function startStoryPhase(
  service: ReturnType<typeof serverSupabaseServiceRole<Database>>,
  job: Database['public']['Tables']['recap_generation_job']['Row'],
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
        progress: 60,
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
  service: ReturnType<typeof serverSupabaseServiceRole<Database>>,
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

  return data
    ? toPublicJob(data)
    : { id: jobId, status: 'failed', progress: 100, errorCode, errorMessage };
}

function toPublicJob(job: Database['public']['Tables']['recap_generation_job']['Row']) {
  return {
    id: job.id,
    status: job.status,
    phase: job.generation_phase,
    progress: job.progress,
    recapId: job.recap_id,
    errorCode: job.error_code,
    errorMessage: job.error_message,
    qualityReport: job.quality_report,
  };
}
