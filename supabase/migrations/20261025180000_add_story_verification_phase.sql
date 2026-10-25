-- Recap v7 verifies every story claim against its cited scenes before
-- publication: the written draft waits in story_data during that pass.
ALTER TABLE public.recap_generation_job
  DROP CONSTRAINT IF EXISTS recap_generation_job_generation_phase_check;

ALTER TABLE public.recap_generation_job
  ADD CONSTRAINT recap_generation_job_generation_phase_check
  CHECK (generation_phase IN ('extracting_events', 'linking_events', 'preparing_story', 'writing_story', 'verifying_story'));

-- A v6 story has no "Épisode par épisode" section and would fail the v7
-- quality gate: mark in-flight jobs explicitly instead.
UPDATE public.recap_generation_job
SET status = 'failed',
    progress = 100,
    error_code = 'pipeline_upgraded_to_v7',
    error_message = 'The recap pipeline changed while this job was running. Start a new generation.',
    completed_at = now(),
    updated_at = now()
WHERE format_version < 7
  AND status IN ('queued', 'gathering', 'generating', 'validating', 'rendering');

ALTER TABLE public.recap_generation_job
  ALTER COLUMN format_version SET DEFAULT 7;
