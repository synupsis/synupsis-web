-- Publishing an override and closing its proposal must be one transaction.
CREATE OR REPLACE FUNCTION public.review_season_content_correction(
  p_correction_id uuid,
  p_decision text,
  p_reviewer_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_correction public.season_content_correction%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Invalid correction decision';
  END IF;

  SELECT * INTO v_correction
  FROM public.season_content_correction
  WHERE id = p_correction_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending correction not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_decision = 'accepted' THEN
    INSERT INTO public.season_content_override (
      season_id, target_type, target_key, field, value, reveal_episode,
      correction_id, approved_by, active
    ) VALUES (
      v_correction.season_id, v_correction.target_type, v_correction.target_key,
      v_correction.field, v_correction.proposed_value, v_correction.reveal_episode,
      v_correction.id, p_reviewer_id, true
    )
    ON CONFLICT (season_id, target_type, target_key, field)
    DO UPDATE SET
      value = EXCLUDED.value,
      reveal_episode = EXCLUDED.reveal_episode,
      correction_id = EXCLUDED.correction_id,
      approved_by = EXCLUDED.approved_by,
      active = true,
      updated_at = timezone('utc'::text, now());
  END IF;

  UPDATE public.season_content_correction
  SET status = p_decision,
      reviewed_by = p_reviewer_id,
      reviewed_at = timezone('utc'::text, now())
  WHERE id = p_correction_id;

  RETURN p_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.review_season_content_correction(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_season_content_correction(uuid, text, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
