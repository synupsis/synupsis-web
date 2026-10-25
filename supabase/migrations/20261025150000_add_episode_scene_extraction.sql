-- Recap v6 extracts scenes episode by episode: one provider response per
-- episode, collected by the polling endpoint, then a season pass that links
-- the verified scenes (arcs, causes, character aliases).
ALTER TABLE public.recap_generation_job
  ADD COLUMN IF NOT EXISTS extraction_responses jsonb,
  ADD COLUMN IF NOT EXISTS extraction_results jsonb;

ALTER TABLE public.recap_generation_job
  DROP CONSTRAINT IF EXISTS recap_generation_job_generation_phase_check;

ALTER TABLE public.recap_generation_job
  ADD CONSTRAINT recap_generation_job_generation_phase_check
  CHECK (generation_phase IN ('extracting_events', 'linking_events', 'preparing_story', 'writing_story'));

-- A v5 job holds a single season-wide extraction response. Mark in-flight
-- jobs explicitly so a deployment cannot reinterpret that payload.
UPDATE public.recap_generation_job
SET status = 'failed',
    progress = 100,
    error_code = 'pipeline_upgraded_to_v6',
    error_message = 'The recap pipeline changed while this job was running. Start a new generation.',
    completed_at = now(),
    updated_at = now()
WHERE format_version < 6
  AND status IN ('queued', 'gathering', 'generating', 'validating', 'rendering');

ALTER TABLE public.recap_generation_job
  ALTER COLUMN format_version SET DEFAULT 6;
