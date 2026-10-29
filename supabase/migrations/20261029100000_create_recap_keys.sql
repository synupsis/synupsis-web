-- Recap keys: a viewer spends a key to unlock a season's recap, their name
-- shows on it, and they earn a point for every other viewer who watches at
-- least half of it. Points turn into keys again. The rules live here and in
-- lib/recap-keys.ts: keep both in step.
--   3 keys on the first visit, 5 at most, 10 points for a key.

CREATE TABLE public.recap_wallet (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- A refund may take a full wallet one key over the cap: it gives back what was spent.
  keys integer NOT NULL DEFAULT 3 CHECK (keys >= 0),
  -- Every point ever earned, as shown on the profile.
  points integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  -- Points toward the next key; it stops at a full key while the wallet is full.
  key_progress integer NOT NULL DEFAULT 0 CHECK (key_progress BETWEEN 0 AND 10),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Who unlocked the recap, as shown on it; no name without a username.
ALTER TABLE public.recap
  ADD COLUMN unlocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN unlocked_by_name text CHECK (char_length(unlocked_by_name) BETWEEN 1 AND 80);

ALTER TABLE public.recap_generation_job
  ADD COLUMN requester_name text CHECK (char_length(requester_name) BETWEEN 1 AND 80),
  -- none: free (a refresh of a recap someone already unlocked); reserved while
  -- it runs; spent once published; refunded when it ends without a recap.
  ADD COLUMN key_state text NOT NULL DEFAULT 'none'
    CHECK (key_state IN ('none', 'reserved', 'spent', 'refunded')),
  -- When the requester heard how it ended, on the show page or on their next visit.
  ADD COLUMN requester_notified_at timestamptz;

CREATE INDEX recap_generation_job_unnotified_idx
  ON public.recap_generation_job (requested_by, completed_at DESC)
  WHERE requester_notified_at IS NULL;

-- A viewer counts once per recap, once they have seen half of its slides.
CREATE TABLE public.recap_view (
  recap_id uuid NOT NULL REFERENCES public.recap(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (recap_id, user_id)
);

CREATE INDEX recap_unlocked_by_idx ON public.recap (unlocked_by) WHERE unlocked_by IS NOT NULL;

ALTER TABLE public.recap_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recap_view ENABLE ROW LEVEL SECURITY;

-- No client policy on purpose: keys and points only move through the
-- service_role-backed endpoints and the functions below.
REVOKE ALL ON TABLE public.recap_wallet FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recap_view FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.recap_wallet TO service_role;
GRANT ALL ON TABLE public.recap_view TO service_role;

-- A full key of progress becomes a key as soon as the wallet has room.
CREATE FUNCTION public.convert_recap_key_progress(p_user_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.recap_wallet
  SET keys = keys + 1,
      key_progress = key_progress - 10,
      updated_at = timezone('utc'::text, now())
  WHERE user_id = p_user_id AND key_progress >= 10 AND keys < 5;
$$;

-- Takes a key from the requester before the job spends anything. Returns the
-- keys left, or raises no_recap_keys (P0001) when there are none.
CREATE FUNCTION public.reserve_recap_key(p_job_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_keys integer;
BEGIN
  SELECT requested_by INTO v_user_id
  FROM public.recap_generation_job
  WHERE id = p_job_id AND key_state = 'none'
  FOR UPDATE;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'recap_key_not_reservable' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.recap_wallet (user_id) VALUES (v_user_id) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.recap_wallet
  SET keys = keys - 1, updated_at = timezone('utc'::text, now())
  WHERE user_id = v_user_id AND keys > 0
  RETURNING keys INTO v_keys;
  IF v_keys IS NULL THEN
    RAISE EXCEPTION 'no_recap_keys' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.recap_generation_job SET key_state = 'reserved' WHERE id = p_job_id;
  PERFORM public.convert_recap_key_progress(v_user_id);
  SELECT keys INTO v_keys FROM public.recap_wallet WHERE user_id = v_user_id;
  RETURN v_keys;
END;
$$;

-- Every way a job ends goes through its status: published spends the key,
-- anything else gives it back, once.
CREATE FUNCTION public.settle_recap_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.key_state <> 'reserved' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'completed' THEN
    NEW.key_state := 'spent';
  ELSIF NEW.status IN ('failed', 'cancelled', 'needs_review') THEN
    NEW.key_state := 'refunded';
    UPDATE public.recap_wallet
    SET keys = keys + 1, updated_at = timezone('utc'::text, now())
    WHERE user_id = NEW.requested_by;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER recap_generation_job_settle_key
  BEFORE UPDATE OF status ON public.recap_generation_job
  FOR EACH ROW EXECUTE FUNCTION public.settle_recap_key();

-- Names the published recap after whoever unlocked the season in this language
-- first: a refresh to a newer format keeps the original name and its points.
CREATE FUNCTION public.attribute_generated_recap(p_job_id uuid, p_recap_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_job public.recap_generation_job%ROWTYPE;
  v_unlocked_by uuid;
  v_unlocked_by_name text;
BEGIN
  SELECT * INTO v_job FROM public.recap_generation_job WHERE id = p_job_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT unlocked_by, unlocked_by_name INTO v_unlocked_by, v_unlocked_by_name
  FROM public.recap
  WHERE season_id = v_job.season_id
    AND locale = v_job.locale
    AND id <> p_recap_id
    AND unlocked_by IS NOT NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_unlocked_by IS NULL THEN
    v_unlocked_by := v_job.requested_by;
    v_unlocked_by_name := v_job.requester_name;
  END IF;

  UPDATE public.recap
  SET unlocked_by = v_unlocked_by, unlocked_by_name = v_unlocked_by_name
  WHERE id = p_recap_id;
END;
$$;

-- Counts a viewer once and gives the point to whoever unlocked the recap.
-- Returns whether the view was new.
CREATE FUNCTION public.record_recap_view(p_recap_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_unlocked_by uuid;
BEGIN
  SELECT unlocked_by INTO v_unlocked_by
  FROM public.recap
  WHERE id = p_recap_id AND status = 'published';
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.recap_view (recap_id, user_id)
  VALUES (p_recap_id, p_user_id)
  ON CONFLICT (recap_id, user_id) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Watching one's own recap earns nothing.
  IF v_unlocked_by IS NULL OR v_unlocked_by = p_user_id THEN RETURN true; END IF;

  INSERT INTO public.recap_wallet (user_id) VALUES (v_unlocked_by) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.recap_wallet
  SET points = points + 1,
      key_progress = LEAST(key_progress + 1, 10),
      updated_at = timezone('utc'::text, now())
  WHERE user_id = v_unlocked_by;
  PERFORM public.convert_recap_key_progress(v_unlocked_by);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_recap_key_progress(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_recap_key(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attribute_generated_recap(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_recap_view(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_recap_key_progress(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_recap_key(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.attribute_generated_recap(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_recap_view(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
