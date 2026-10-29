-- A point needs a server-observed reading session, not a bare claim that the
-- browser crossed 50%. The slide count comes from the server's display plan.
CREATE TABLE public.recap_view_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recap_id uuid NOT NULL REFERENCES public.recap(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slide_count integer NOT NULL CHECK (slide_count > 0),
  seen_slides integer[] NOT NULL DEFAULT '{}',
  current_slide integer,
  slide_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '2 hours'),
  completed boolean NOT NULL DEFAULT false,
  UNIQUE (recap_id, user_id),
  CHECK (current_slide IS NULL OR current_slide BETWEEN 0 AND slide_count - 1)
);

ALTER TABLE public.recap_view_session ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recap_view_session FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.recap_view_session TO service_role;

CREATE FUNCTION public.start_recap_view_session(
  p_recap_id uuid, p_user_id uuid, p_slide_count integer, p_slide_index integer
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
  v_session_id uuid;
BEGIN
  IF p_slide_count IS NULL OR p_slide_count < 1 OR p_slide_index IS NULL
    OR p_slide_index < 0 OR p_slide_index >= p_slide_count THEN
    RAISE EXCEPTION 'invalid_recap_slide' USING ERRCODE = '22023';
  END IF;
  SELECT unlocked_by INTO v_owner FROM public.recap
  WHERE id = p_recap_id AND status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'recap_not_found' USING ERRCODE = 'P0002'; END IF;
  -- No reward is possible, or this viewer has already given it.
  IF v_owner IS NULL OR v_owner = p_user_id OR EXISTS (
    SELECT 1 FROM public.recap_view WHERE recap_id = p_recap_id AND user_id = p_user_id
  ) THEN RETURN NULL; END IF;

  -- One active session per viewer/recap prevents parallel sessions from
  -- accumulating simultaneous display time. A new session invalidates the old.
  INSERT INTO public.recap_view_session (recap_id, user_id, slide_count, current_slide)
  VALUES (p_recap_id, p_user_id, p_slide_count, p_slide_index)
  ON CONFLICT (recap_id, user_id) DO UPDATE
    SET id = gen_random_uuid(), slide_count = EXCLUDED.slide_count,
        current_slide = EXCLUDED.current_slide, seen_slides = '{}',
        slide_started_at = clock_timestamp(), expires_at = clock_timestamp() + interval '2 hours',
        completed = false
  RETURNING id INTO v_session_id;
  RETURN v_session_id;
END;
$$;

CREATE FUNCTION public.record_recap_view_progress(
  p_session_id uuid, p_recap_id uuid, p_user_id uuid, p_slide_index integer
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_session public.recap_view_session%ROWTYPE;
  v_now timestamptz;
  v_seen integer[];
  v_complete boolean;
BEGIN
  SELECT * INTO v_session FROM public.recap_view_session
  WHERE id = p_session_id AND recap_id = p_recap_id AND user_id = p_user_id
  FOR UPDATE;
  v_now := clock_timestamp();
  IF NOT FOUND OR v_session.expires_at <= v_now THEN
    RAISE EXCEPTION 'recap_view_session_expired' USING ERRCODE = 'P0002';
  END IF;
  IF p_slide_index IS NOT NULL AND (p_slide_index < 0 OR p_slide_index >= v_session.slide_count) THEN
    RAISE EXCEPTION 'invalid_recap_slide' USING ERRCODE = '22023';
  END IF;
  IF v_session.completed THEN RETURN true; END IF;

  v_seen := v_session.seen_slides;
  -- Time is measured here, never supplied by the client. Switching straight
  -- through slides or jumping to the end cannot earn a view. A null slide
  -- pauses the clock when the player closes or the tab becomes hidden.
  -- Keep 1 second and the 50% threshold aligned with lib/recap-keys.ts.
  IF p_slide_index IS NOT NULL AND v_session.current_slide IS NOT NULL
    AND v_now - v_session.slide_started_at >= interval '1 second'
    AND NOT (v_session.current_slide = ANY(v_seen)) THEN
    v_seen := array_append(v_seen, v_session.current_slide);
  END IF;
  v_complete := cardinality(v_seen) >= ceil(v_session.slide_count * 0.5);
  IF v_complete THEN
    PERFORM public.record_recap_view(p_recap_id, p_user_id);
  END IF;
  UPDATE public.recap_view_session
  SET seen_slides = v_seen, current_slide = p_slide_index, completed = v_complete,
      slide_started_at = CASE WHEN current_slide IS DISTINCT FROM p_slide_index THEN v_now ELSE slide_started_at END
  WHERE id = p_session_id;
  RETURN v_complete;
END;
$$;

REVOKE ALL ON FUNCTION public.start_recap_view_session(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_recap_view_progress(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_recap_view_session(uuid, uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_recap_view_progress(uuid, uuid, uuid, integer) TO service_role;
NOTIFY pgrst, 'reload schema';
