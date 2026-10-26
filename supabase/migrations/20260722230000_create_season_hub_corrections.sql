-- Community corrections stay behind server APIs so spoiler filtering can be
-- applied before any proposal or accepted value reaches a browser.
CREATE TABLE public.season_content_correction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.season(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('event', 'character', 'arc', 'context')),
  target_key text NOT NULL CHECK (char_length(target_key) BETWEEN 1 AND 100),
  field text NOT NULL CHECK (char_length(field) BETWEEN 1 AND 50),
  current_value jsonb NOT NULL,
  proposed_value jsonb NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 2000),
  source_url text,
  reveal_episode integer NOT NULL DEFAULT 0 CHECK (reveal_episode >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  reviewed_at timestamptz
);

CREATE INDEX season_content_correction_queue_idx
  ON public.season_content_correction (season_id, status, reveal_episode, created_at DESC);

CREATE TABLE public.season_content_correction_vote (
  correction_id uuid NOT NULL REFERENCES public.season_content_correction(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (correction_id, user_id)
);

CREATE TABLE public.season_content_override (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.season(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('event', 'character', 'arc', 'context')),
  target_key text NOT NULL CHECK (char_length(target_key) BETWEEN 1 AND 100),
  field text NOT NULL CHECK (char_length(field) BETWEEN 1 AND 50),
  value jsonb NOT NULL,
  reveal_episode integer NOT NULL DEFAULT 0 CHECK (reveal_episode >= 0),
  correction_id uuid REFERENCES public.season_content_correction(id) ON DELETE SET NULL,
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (season_id, target_type, target_key, field)
);

CREATE INDEX season_content_override_active_idx
  ON public.season_content_override (season_id, reveal_episode)
  WHERE active = true;

ALTER TABLE public.season_content_correction ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_content_correction_vote ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_content_override ENABLE ROW LEVEL SECURITY;

-- No client policy on purpose: service_role-backed endpoints validate the
-- viewer's spoiler cursor and only return the safe subset.
REVOKE ALL ON TABLE public.season_content_correction FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.season_content_correction_vote FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.season_content_override FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.season_content_correction TO service_role;
GRANT ALL ON TABLE public.season_content_correction_vote TO service_role;
GRANT ALL ON TABLE public.season_content_override TO service_role;

NOTIFY pgrst, 'reload schema';
