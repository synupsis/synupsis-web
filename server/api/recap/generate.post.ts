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
  createEpisodeExtractionPrompt,
  describeInsufficientSources,
  evaluateRecapSourceReadiness,
  fetchRecapSourceSnapshot,
  getEpisodeExtractionTokenBudget,
  getExtractableEpisodes,
  getRecapModel,
  startEpisodeExtraction,
} from '~/server/services/recap-generation';
import { expireStaleRecapGenerationJobs } from '~/server/services/recap-generation-runner';
import {
  RECAP_GENERATION_ACTIVE_STATUSES,
  getRecapGenerationProgress,
} from '~/lib/recap-generation-progress';

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
      prompt_template: promptConfig.template ?? null,
      locale: RECAP_LOCALE,
      format_version: RECAP_FORMAT_VERSION,
      model,
      prompt_version: RECAP_PROMPT_VERSION,
      status: 'gathering',
      progress: getRecapGenerationProgress('gathering'),
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
    if (jobError?.code === 'PGRST204') {
      console.error('The recap v4 database migration is missing:', jobError);
      throw createError({
        statusCode: 503,
        statusMessage: 'The recap database schema is outdated. Apply migration 20260722210000 before generating.',
      });
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

    // Teasers cannot support a precise recap: stop before spending tokens.
    const readiness = evaluateRecapSourceReadiness(snapshot);
    if (!readiness.ready) {
      const message = describeInsufficientSources(readiness);
      const completedAt = new Date().toISOString();
      const { error: updateError } = await service
        .from('recap_generation_job')
        .update({
          status: 'failed',
          progress: 100,
          error_code: 'insufficient_sources',
          error_message: message,
          source_snapshot: snapshot as unknown as Json,
          quality_report: { stage: 'sources', ...readiness } as unknown as Json,
          completed_at: completedAt,
          updated_at: completedAt,
        })
        .eq('id', job.id);
      if (updateError) throw updateError;

      // The message travels in the body: h3 strips accented characters from status lines.
      setResponseStatus(event, 422);
      return { state: 'insufficient_sources', jobId: job.id, statusMessage: message, readiness };
    }

    // One extraction per episode, in parallel; the polling endpoint collects them.
    const extractionResponses = Object.fromEntries(await Promise.all(
      getExtractableEpisodes(snapshot).map(async (episode) => {
        const providerResponse = await startEpisodeExtraction({
          prompt: createEpisodeExtractionPrompt(snapshot, episode),
          model,
          jobId: job.id,
          episodeNumber: episode.number,
          maxOutputTokens: getEpisodeExtractionTokenBudget(episode),
        });
        return [String(episode.number), providerResponse.id] as const;
      }),
    ));

    const { error: updateError } = await service
      .from('recap_generation_job')
      .update({
        status: 'generating',
        progress: getRecapGenerationProgress('extracting_events'),
        provider_response_id: null,
        extraction_responses: extractionResponses,
        extraction_results: {},
        generation_phase: 'extracting_events',
        source_snapshot: snapshot as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    if (updateError) throw updateError;

    setResponseStatus(event, 202);
    return { state: 'generating', jobId: job.id, progress: getRecapGenerationProgress('extracting_events') };
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
  await expireStaleRecapGenerationJobs(service);
  const { data, error } = await service
    .from('recap_generation_job')
    .select('id, status, progress')
    .eq('season_id', seasonId)
    .eq('locale', RECAP_LOCALE)
    .eq('format_version', RECAP_FORMAT_VERSION)
    .in('status', RECAP_GENERATION_ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
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
