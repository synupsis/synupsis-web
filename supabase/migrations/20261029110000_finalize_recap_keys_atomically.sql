-- Publication, attribution and payment are one transaction. The job lock also
-- serializes finalization with expiry, so a refunded job cannot publish later.
CREATE OR REPLACE FUNCTION public.attribute_generated_recap(p_job_id uuid, p_recap_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_job public.recap_generation_job%ROWTYPE;
  v_unlocked_by uuid;
  v_unlocked_by_name text;
BEGIN
  SELECT * INTO STRICT v_job FROM public.recap_generation_job WHERE id = p_job_id;

  -- Include the target itself: refreshing an existing canonical row must keep
  -- its original unlocker just like publishing a newer format does.
  SELECT unlocked_by, unlocked_by_name INTO v_unlocked_by, v_unlocked_by_name
  FROM public.recap
  WHERE season_id = v_job.season_id
    AND locale = v_job.locale
    AND unlocked_by IS NOT NULL
  ORDER BY created_at ASC, id
  LIMIT 1;

  UPDATE public.recap
  SET unlocked_by = COALESCE(v_unlocked_by, v_job.requested_by),
      unlocked_by_name = CASE WHEN v_unlocked_by IS NOT NULL
        THEN v_unlocked_by_name ELSE v_job.requester_name END
  WHERE id = p_recap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recap_not_found';
  END IF;
END;
$$;

CREATE FUNCTION public.finalize_recap_generation(
  p_job_id uuid,
  p_story_data jsonb,
  p_quality_report jsonb,
  p_slides jsonb
)
RETURNS SETOF public.recap_generation_job
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_job public.recap_generation_job%ROWTYPE;
  v_recap_id uuid;
BEGIN
  SELECT * INTO STRICT v_job
  FROM public.recap_generation_job WHERE id = p_job_id
  FOR UPDATE;

  -- Retrying a committed response is harmless. If expiry won the lock, return
  -- its terminal result without publishing or spending the refunded key.
  IF v_job.status IN ('completed', 'failed', 'cancelled', 'needs_review') THEN
    RETURN NEXT v_job;
    RETURN;
  END IF;
  IF v_job.status NOT IN ('validating', 'rendering')
    OR v_job.key_state NOT IN ('none', 'reserved') THEN
    RAISE EXCEPTION 'recap_generation_not_ready';
  END IF;

  v_recap_id := public.publish_generated_recap(
    v_job.show_id, v_job.season_id, v_job.locale, v_job.format_version,
    v_job.source_snapshot, v_job.event_graph, p_story_data, p_quality_report,
    v_job.prompt_id, v_job.model, v_job.prompt_version, p_slides
  );
  PERFORM public.attribute_generated_recap(v_job.id, v_recap_id);

  -- The settlement trigger consumes the reserved key in this same transaction.
  -- Any failure here or in attribution rolls back the recap and its slides too.
  UPDATE public.recap_generation_job
  SET status = 'completed', progress = 100, recap_id = v_recap_id,
      story_data = p_story_data, quality_report = p_quality_report,
      error_code = NULL, error_message = NULL,
      completed_at = now(), updated_at = now()
  WHERE id = v_job.id
  RETURNING * INTO v_job;
  RETURN NEXT v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_recap_generation(uuid, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_recap_generation(uuid, jsonb, jsonb, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
