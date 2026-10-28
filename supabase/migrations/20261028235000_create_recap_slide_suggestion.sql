-- Suggestions from viewers on a recap's slides: a corrected text, a change to
-- describe, or a new slide. Viewers like the ones they agree with, and the
-- team reviews them, most liked first.
CREATE TABLE public.recap_slide_suggestion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recap_id uuid NOT NULL REFERENCES public.recap(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('text', 'change', 'add')),
  -- The slide to change, or the one a new slide comes after (1 is the cover).
  slide_order integer NOT NULL CHECK (slide_order BETWEEN 1 AND 500),
  -- The slide as the viewer saw it (kind, episode, text): a regenerated recap
  -- may move or rewrite it.
  slide_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- A text correction: where the text sits in the slide content, as it was, and as proposed.
  field_path text CHECK (char_length(field_path) BETWEEN 1 AND 100),
  current_value text CHECK (char_length(current_value) <= 3000),
  proposed_value text CHECK (char_length(btrim(proposed_value)) BETWEEN 1 AND 3000),
  -- Required to describe a change or a new slide; an optional reason for a text correction.
  message text CHECK (char_length(btrim(message)) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The author as shown when the suggestion was made; no name without a username.
  author_name text CHECK (char_length(author_name) BETWEEN 1 AND 80),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  reviewed_at timestamptz,
  CHECK (
    (kind = 'text' AND field_path IS NOT NULL AND current_value IS NOT NULL AND proposed_value IS NOT NULL)
    OR (kind <> 'text' AND field_path IS NULL AND proposed_value IS NULL AND char_length(btrim(message)) >= 10)
  )
);

CREATE INDEX recap_slide_suggestion_recap_idx
  ON public.recap_slide_suggestion (recap_id, status, slide_order);
CREATE INDEX recap_slide_suggestion_queue_idx
  ON public.recap_slide_suggestion (status, created_at);

-- A viewer likes a suggestion at most once.
CREATE TABLE public.recap_slide_suggestion_like (
  suggestion_id uuid NOT NULL REFERENCES public.recap_slide_suggestion(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (suggestion_id, user_id)
);

ALTER TABLE public.recap_slide_suggestion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recap_slide_suggestion_like ENABLE ROW LEVEL SECURITY;

-- No client policy on purpose: service_role-backed endpoints check that the
-- viewer can read the recap before showing, adding or liking a suggestion.
REVOKE ALL ON TABLE public.recap_slide_suggestion FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recap_slide_suggestion_like FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.recap_slide_suggestion TO service_role;
GRANT ALL ON TABLE public.recap_slide_suggestion_like TO service_role;

NOTIFY pgrst, 'reload schema';
