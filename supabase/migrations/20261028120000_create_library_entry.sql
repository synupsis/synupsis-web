-- A viewer's library: the series they keep, with their progress when they
-- track it episode by episode. No season means saved without tracking.
CREATE TABLE public.library_entry (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  show_id uuid NOT NULL REFERENCES public.show(id) ON DELETE CASCADE,
  -- The page address, so the library links back without asking Trakt.
  slug text NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 200),
  season integer CHECK (season > 0),
  episode integer NOT NULL DEFAULT 0 CHECK (episode >= 0),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, show_id)
);

CREATE INDEX library_entry_recent_idx ON public.library_entry (user_id, updated_at DESC);

ALTER TABLE public.library_entry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their library" ON public.library_entry
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users add to their library" ON public.library_entry
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users update their library" ON public.library_entry
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users remove from their library" ON public.library_entry
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.library_entry FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.library_entry TO authenticated;
GRANT ALL ON TABLE public.library_entry TO service_role;

NOTIFY pgrst, 'reload schema';
