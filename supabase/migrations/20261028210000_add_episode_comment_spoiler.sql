-- An author can flag their comment as a spoiler, for what goes beyond the
-- episode (later episodes, the books…): it stays hidden until a viewer reveals it.
ALTER TABLE public.episode_comment
  ADD COLUMN is_spoiler boolean NOT NULL DEFAULT false;

-- Supabase grants every privilege on new tables to signed-in users by default.
-- Keep only what the comment policies need, so the update policy below cannot
-- reach a comment's text and nobody can truncate these tables.
REVOKE ALL ON TABLE public.episode_comment, public.episode_comment_like, public.episode_comment_report FROM authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.episode_comment, public.episode_comment_like TO authenticated;
GRANT SELECT, INSERT ON TABLE public.episode_comment_report TO authenticated;

-- Authors may change the flag afterwards, and nothing else of their comment.
CREATE POLICY "Authors flag their comments as spoilers" ON public.episode_comment
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT UPDATE (is_spoiler) ON TABLE public.episode_comment TO authenticated;

NOTIFY pgrst, 'reload schema';
