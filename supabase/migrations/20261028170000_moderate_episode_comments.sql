-- Episode comments: a posting rate limit, viewer reports, and admin moderation.

-- At most one comment every 10 seconds and 30 an hour per viewer, whatever the client.
CREATE FUNCTION public.limit_episode_comment_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.episode_comment
    WHERE user_id = NEW.user_id AND created_at > now() - interval '10 seconds'
  ) OR (
    SELECT count(*) FROM public.episode_comment
    WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour'
  ) >= 30 THEN
    RAISE EXCEPTION 'Too many comments.' USING ERRCODE = 'P0429';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.limit_episode_comment_rate() FROM PUBLIC, anon, authenticated;

CREATE INDEX episode_comment_author_recent_idx ON public.episode_comment (user_id, created_at DESC);

CREATE TRIGGER episode_comment_rate_limit
  BEFORE INSERT ON public.episode_comment
  FOR EACH ROW EXECUTE FUNCTION public.limit_episode_comment_rate();

-- One report per viewer and comment; admins review them.
CREATE TABLE public.episode_comment_report (
  comment_id uuid NOT NULL REFERENCES public.episode_comment(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (comment_id, reporter_id)
);

ALTER TABLE public.episode_comment_report ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewers see their reports" ON public.episode_comment_report
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = reporter_id);
-- Only a comment the viewer can read, and not their own.
CREATE POLICY "Viewers report readable comments" ON public.episode_comment_report
  FOR INSERT TO authenticated WITH CHECK (
    (SELECT auth.uid()) = reporter_id
    AND EXISTS (
      SELECT 1 FROM public.episode_comment comment
      WHERE comment.id = comment_id AND comment.user_id <> (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE public.episode_comment_report FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.episode_comment_report TO authenticated;
GRANT ALL ON TABLE public.episode_comment_report TO service_role;

-- Admins remove any comment, on any episode.
CREATE POLICY "Admins remove comments" ON public.episode_comment
  FOR DELETE TO authenticated USING (public.is_admin((SELECT auth.uid())));

NOTIFY pgrst, 'reload schema';
