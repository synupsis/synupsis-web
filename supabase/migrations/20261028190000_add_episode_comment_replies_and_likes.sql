-- Episode comments get one level of replies, and likes.

-- A reply belongs to a top-level comment of the same episode; removing the comment removes its replies.
ALTER TABLE public.episode_comment
  ADD COLUMN parent_id uuid REFERENCES public.episode_comment(id) ON DELETE CASCADE;

CREATE INDEX episode_comment_parent_idx ON public.episode_comment (parent_id, created_at)
  WHERE parent_id IS NOT NULL;

CREATE FUNCTION public.check_episode_comment_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.episode_comment parent
    WHERE parent.id = NEW.parent_id
      AND parent.parent_id IS NULL
      AND parent.show_id = NEW.show_id
      AND parent.season = NEW.season
      AND parent.episode = NEW.episode
  ) THEN
    RAISE EXCEPTION 'Invalid parent comment.' USING ERRCODE = 'P0422';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_episode_comment_parent() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER episode_comment_parent_check
  BEFORE INSERT ON public.episode_comment
  FOR EACH ROW EXECUTE FUNCTION public.check_episode_comment_parent();

-- A viewer likes a comment at most once.
CREATE TABLE public.episode_comment_like (
  comment_id uuid NOT NULL REFERENCES public.episode_comment(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE public.episode_comment_like ENABLE ROW LEVEL SECURITY;

-- Likes follow their comment: whoever can read it sees and adds likes.
CREATE POLICY "Viewers see likes of readable comments" ON public.episode_comment_like
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.episode_comment comment WHERE comment.id = comment_id)
  );
CREATE POLICY "Viewers like readable comments" ON public.episode_comment_like
  FOR INSERT TO authenticated WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.episode_comment comment WHERE comment.id = comment_id)
  );
CREATE POLICY "Viewers remove their likes" ON public.episode_comment_like
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.episode_comment_like FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.episode_comment_like TO authenticated;
GRANT ALL ON TABLE public.episode_comment_like TO service_role;

NOTIFY pgrst, 'reload schema';
