-- Recap v8 adds a critic between extraction and linking: the model suggests
-- missing moments, then one recovery call per episode keeps only the ones the
-- sources quote verbatim. Recovery responses reuse extraction_responses.
ALTER TABLE public.recap_generation_job
  DROP CONSTRAINT IF EXISTS recap_generation_job_generation_phase_check;

ALTER TABLE public.recap_generation_job
  ADD CONSTRAINT recap_generation_job_generation_phase_check
  CHECK (generation_phase IN (
    'extracting_events',
    'critiquing_events',
    'recovering_events',
    'linking_events',
    'preparing_story',
    'writing_story',
    'verifying_story'
  ));

-- A v7 job would skip the critic and fail the v8 critical-scene gate: mark
-- in-flight jobs explicitly instead.
UPDATE public.recap_generation_job
SET status = 'failed',
    progress = 100,
    error_code = 'pipeline_upgraded_to_v8',
    error_message = 'The recap pipeline changed while this job was running. Start a new generation.',
    completed_at = now(),
    updated_at = now()
WHERE format_version < 8
  AND status IN ('queued', 'gathering', 'generating', 'validating', 'rendering');

ALTER TABLE public.recap_generation_job
  ALTER COLUMN format_version SET DEFAULT 8;
