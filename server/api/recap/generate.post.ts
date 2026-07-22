import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from '#supabase/server';
import type { Database, Json } from '~/types/database.types';
import { isEnabledSetting } from '~/server/utils/app-settings';
import { isRecapPromptCompatible } from '~/lib/prompts/defaultPrompt';
import {
  RECAP_FORMAT_VERSION,
  RECAP_LOCALE,
  RECAP_PROMPT_VERSION,
  createRecapPrompt,
  fetchRecapSourceSnapshot,
  getRecapModel,
  startRecapGeneration,
} from '~/server/services/recap-generation';

const ACTIVE_JOB_STATUSES = ['queued', 'gathering', 'generating', 'validating', 'rendering'];
const ACTIVE_JOB_TIMEOUT_MS = 30 * 60 * 1_000;

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication is required to generate a recap.' });
  }

  const body = await readBody<{ showId?: string; seasonId?: string }>(event);
  const showId = body?.showId;
  const seasonId = body?.seasonId;
  if (!showId || !seasonId) {
    throw createError({ statusCode: 400, statusMessage: 'showId and seasonId are required.' });
  }

  const service = serverSupabaseServiceRole<Database>(event);
  const model = getRecapModel();

  const { data: existingRecap, error: existingRecapError } = await service
    .from('recap')
    .select('id')
    .eq('season_id', seasonId)
    .eq('locale', RECAP_LOCALE)
    .eq('format_version', RECAP_FORMAT_VERSION)
    .eq('is_canonical', true)
    .eq('status', 'published')
    .limit(1)
    .maybeSingle();

  if (existingRecapError) {
    throw createError({ statusCode: 500, statusMessage: 'Could not check existing recaps.' });
  }
  if (existingRecap) {
    return { state: 'ready', recapId: existingRecap.id };
  }

  const existingJob = await findActiveJob(service, seasonId);
  if (existingJob) {
    setResponseStatus(event, 202);
    return { state: existingJob.status, jobId: existingJob.id, progress: existingJob.progress };
  }

  const [{ data: show, error: showError }, { data: season, error: seasonError }] = await Promise.all([
    service
      .from('show')
      .select('id, name, trakt_id, genres, summary, image')
      .eq('id', showId)
      .single(),
    service
      .from('season')
      .select('id, show_id, number, first_aired, image')
      .eq('id', seasonId)
      .eq('show_id', showId)
      .single(),
  ]);

  if (showError || !show || seasonError || !season || !show.trakt_id || season.number <= 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'The requested show and season combination was not found.',
    });
  }

  const promptConfig = await getPromptConfig(service);
  const { data: job, error: jobError } = await service
    .from('recap_generation_job')
    .insert({
      requested_by: user.sub,
      show_id: showId,
      season_id: seasonId,
      prompt_id: promptConfig.promptId,
      locale: RECAP_LOCALE,
      format_version: RECAP_FORMAT_VERSION,
      model,
      prompt_version: RECAP_PROMPT_VERSION,
      status: 'gathering',
      progress: 10,
      started_at: new Date().toISOString(),
    })
    .select('id, status, progress')
    .single();

  if (jobError || !job) {
    // A concurrent request may have won the partial unique-index race.
    if (jobError?.code === '23505') {
      const concurrentJob = await findActiveJob(service, seasonId);
      if (concurrentJob) {
        setResponseStatus(event, 202);
        return { state: concurrentJob.status, jobId: concurrentJob.id, progress: concurrentJob.progress };
      }
    }
    console.error('Failed to create recap generation job:', jobError);
    throw createError({ statusCode: 500, statusMessage: 'Could not create the generation job.' });
  }

  try {
    const snapshot = await fetchRecapSourceSnapshot({
      showId,
      seasonId,
      showName: show.name,
      showTraktId: show.trakt_id,
      showGenres: show.genres,
      showOverview: show.summary,
      showImage: show.image,
      seasonNumber: season.number,
      seasonFirstAired: season.first_aired,
      seasonImage: season.image,
    });
    const prompt = createRecapPrompt(snapshot, promptConfig.template);
    const providerResponse = await startRecapGeneration({ prompt, model, jobId: job.id });

    const { error: updateError } = await service
      .from('recap_generation_job')
      .update({
        status: 'generating',
        progress: 40,
        provider_response_id: providerResponse.id,
        source_snapshot: snapshot as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    if (updateError) throw updateError;

    setResponseStatus(event, 202);
    return { state: 'generating', jobId: job.id, progress: 40 };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown generation error.';
    console.error('Failed to start recap generation:', error);
    await service
      .from('recap_generation_job')
      .update({
        status: 'failed',
        error_code: 'generation_start_failed',
        error_message: message,
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    throw createError({ statusCode: 502, statusMessage: message });
  }
});

async function findActiveJob(
  service: ReturnType<typeof serverSupabaseServiceRole<Database>>,
  seasonId: string,
) {
  const { data, error } = await service
    .from('recap_generation_job')
    .select('id, status, progress, updated_at')
    .eq('season_id', seasonId)
    .eq('locale', RECAP_LOCALE)
    .eq('format_version', RECAP_FORMAT_VERSION)
    .in('status', ACTIVE_JOB_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  if (data && new Date(data.updated_at).getTime() < Date.now() - ACTIVE_JOB_TIMEOUT_MS) {
    const completedAt = new Date().toISOString();
    await service
      .from('recap_generation_job')
      .update({
        status: 'failed',
        progress: 100,
        error_code: 'generation_job_expired',
        error_message: 'The generation job did not complete within 30 minutes.',
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq('id', data.id)
      .in('status', ACTIVE_JOB_STATUSES);
    return null;
  }

  return data;
}

async function getPromptConfig(
  service: ReturnType<typeof serverSupabaseServiceRole<Database>>,
): Promise<{ promptId: string | null; template?: string }> {
  const { data: setting } = await service
    .from('app_settings')
    .select('value')
    .eq('key', 'use_default_prompt')
    .maybeSingle();

  if (isEnabledSetting(setting?.value)) {
    return { promptId: null };
  }

  const { data: activePrompt } = await service
    .from('prompts')
    .select('id, content')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const supportsCurrentStoryFormat = activePrompt
    ? isRecapPromptCompatible(activePrompt.content)
    : false;

  return activePrompt && supportsCurrentStoryFormat
    ? { promptId: activePrompt.id, template: activePrompt.content }
    : { promptId: null };
}
