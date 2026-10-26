-- The browser eases the progress bar from the start of the current stage, so
-- every viewer, after a refresh too, sees the same percentage. A trigger keeps
-- the timestamp whichever code path changes the status or the phase.
ALTER TABLE public.recap_generation_job
  ADD COLUMN IF NOT EXISTS stage_started_at timestamptz;

UPDATE public.recap_generation_job
SET stage_started_at = updated_at
WHERE stage_started_at IS NULL;

ALTER TABLE public.recap_generation_job
  ALTER COLUMN stage_started_at SET DEFAULT timezone('utc'::text, now()),
  ALTER COLUMN stage_started_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.mark_recap_generation_stage_start()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
    OR NEW.generation_phase IS DISTINCT FROM OLD.generation_phase THEN
    NEW.stage_started_at := timezone('utc'::text, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recap_generation_job_stage_start ON public.recap_generation_job;
CREATE TRIGGER recap_generation_job_stage_start
  BEFORE UPDATE ON public.recap_generation_job
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_recap_generation_stage_start();

-- The server worker lists the jobs it advances by status.
CREATE INDEX IF NOT EXISTS recap_generation_job_active_idx
  ON public.recap_generation_job (status, created_at)
  WHERE status IN ('queued', 'gathering', 'generating', 'validating', 'rendering');
