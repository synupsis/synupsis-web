-- Shows and seasons come from Trakt through the server, and recaps and slides
-- through the admin editor or the generation pipeline, all with the service
-- role. Clients keep read access only: a public insert let anyone store HTML
-- in a show summary, and any account could publish a recap of its own.
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.show;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.season;

DROP POLICY IF EXISTS "Users can insert their own recaps." ON public.recap;
DROP POLICY IF EXISTS "Users can update their own recaps." ON public.recap;
DROP POLICY IF EXISTS "Users can delete their own recaps." ON public.recap;

DROP POLICY IF EXISTS "Users can insert slides for recaps they own." ON public.slide;
DROP POLICY IF EXISTS "Users can update slides for recaps they own." ON public.slide;
DROP POLICY IF EXISTS "Users can delete slides for recaps they own." ON public.slide;

-- Without a policy, RLS already refuses these writes; the grants go too.
REVOKE INSERT, UPDATE, DELETE ON public.show, public.season, public.recap, public.slide FROM anon, authenticated;
