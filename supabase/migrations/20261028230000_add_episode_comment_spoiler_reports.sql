-- Viewers can report a comment as a spoiler. From two reports on, it is hidden
-- as a spoiler for everyone, whatever its author chose.
ALTER TABLE public.episode_comment
  ADD COLUMN spoiler_report_count integer NOT NULL DEFAULT 0 CHECK (spoiler_report_count >= 0);

COMMENT ON COLUMN public.episode_comment.spoiler_report_count IS
  'Spoiler reports from viewers, kept by a trigger; two or more hide the comment as a spoiler.';

CREATE TABLE public.episode_comment_spoiler_report (
  comment_id uuid NOT NULL REFERENCES public.episode_comment(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (comment_id, reporter_id)
);

ALTER TABLE public.episode_comment_spoiler_report ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewers see their spoiler reports" ON public.episode_comment_spoiler_report
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = reporter_id);
-- Only a comment the viewer can read, and not their own.
CREATE POLICY "Viewers report spoilers in readable comments" ON public.episode_comment_spoiler_report
  FOR INSERT TO authenticated WITH CHECK (
    (SELECT auth.uid()) = reporter_id
    AND EXISTS (
      SELECT 1 FROM public.episode_comment comment
      WHERE comment.id = comment_id AND comment.user_id <> (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE public.episode_comment_spoiler_report FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.episode_comment_spoiler_report TO authenticated;
GRANT ALL ON TABLE public.episode_comment_spoiler_report TO service_role;

-- Viewers cannot write the count themselves: the trigger keeps it.
CREATE FUNCTION public.count_episode_comment_spoiler_reports()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.episode_comment
  SET spoiler_report_count = (
    SELECT count(*) FROM public.episode_comment_spoiler_report report
    WHERE report.comment_id = COALESCE(NEW.comment_id, OLD.comment_id)
  )
  WHERE id = COALESCE(NEW.comment_id, OLD.comment_id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.count_episode_comment_spoiler_reports() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER episode_comment_spoiler_report_count
  AFTER INSERT OR DELETE ON public.episode_comment_spoiler_report
  FOR EACH ROW EXECUTE FUNCTION public.count_episode_comment_spoiler_reports();

NOTIFY pgrst, 'reload schema';
