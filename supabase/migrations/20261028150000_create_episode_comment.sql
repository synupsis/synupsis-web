-- Comments on one episode of a series. Only viewers whose library progress
-- reaches that episode can read or write them, so nobody is spoiled.
CREATE TABLE public.episode_comment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES public.show(id) ON DELETE CASCADE,
  season integer NOT NULL CHECK (season > 0),
  episode integer NOT NULL CHECK (episode > 0),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The author as shown when the comment was written; other viewers cannot read auth.users.
  -- No name without a username: an email address is never shown.
  author_name text CHECK (char_length(author_name) BETWEEN 1 AND 80),
  author_avatar_url text CHECK (char_length(author_avatar_url) <= 2000),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX episode_comment_episode_idx ON public.episode_comment (show_id, season, episode, created_at DESC);

-- Whether the current viewer's tracked progress reaches this episode.
CREATE FUNCTION public.has_watched_episode(p_show_id uuid, p_season integer, p_episode integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.library_entry entry
    WHERE entry.user_id = (SELECT auth.uid())
      AND entry.show_id = p_show_id
      AND entry.season IS NOT NULL
      AND (entry.season > p_season OR (entry.season = p_season AND entry.episode >= p_episode))
  );
$$;

ALTER TABLE public.episode_comment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewers read comments of watched episodes" ON public.episode_comment
  FOR SELECT TO authenticated USING (
    (SELECT auth.uid()) = user_id OR public.has_watched_episode(show_id, season, episode)
  );
CREATE POLICY "Viewers comment on watched episodes" ON public.episode_comment
  FOR INSERT TO authenticated WITH CHECK (
    (SELECT auth.uid()) = user_id AND public.has_watched_episode(show_id, season, episode)
  );
CREATE POLICY "Authors remove their comments" ON public.episode_comment
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.episode_comment FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.episode_comment TO authenticated;
GRANT ALL ON TABLE public.episode_comment TO service_role;
REVOKE ALL ON FUNCTION public.has_watched_episode(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_watched_episode(uuid, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
