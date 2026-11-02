-- A viewer's public page, at /u/<handle>: the name and avatar already shown on
-- their comments, suggestions and recaps, a short bio, and the address itself.
-- Only accounts with a username have a page: an anonymous viewer stays anonymous.
CREATE TABLE public.public_profile (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The page address; given with the first username, then it never changes.
  handle text UNIQUE CHECK (handle ~ '^[a-z0-9][a-z0-9_-]{1,29}$'),
  -- Copied from the account metadata by the trigger below; no name without a username.
  display_name text CHECK (char_length(display_name) BETWEEN 1 AND 80),
  avatar_url text CHECK (char_length(avatar_url) <= 2000),
  bio text CHECK (char_length(bio) <= 160),
  -- When the account was created: "member since".
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- A free address close to the username: lower case, no accents, '-' between
-- words, and a number after it when another account already has it.
CREATE FUNCTION public.public_profile_handle(p_name text, p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_base text;
  v_candidate text;
  v_suffix integer := 1;
BEGIN
  v_base := translate(lower(coalesce(p_name, '')),
    'àáâãäåæçèéêëìíîïñòóôõöøœùúûüýÿß', 'aaaaaaaceeeeiiiinooooooouuuuyys');
  v_base := regexp_replace(v_base, '[^a-z0-9_-]+', '-', 'g');
  v_base := left(regexp_replace(v_base, '^[-_]+|[-_]+$', '', 'g'), 24);
  v_base := regexp_replace(v_base, '[-_]+$', '');
  IF char_length(v_base) < 2 THEN v_base := 'viewer'; END IF;
  v_candidate := v_base;
  WHILE EXISTS (
    SELECT 1 FROM public.public_profile
    WHERE handle = v_candidate AND user_id <> p_user_id
  ) LOOP
    v_suffix := v_suffix + 1;
    v_candidate := v_base || '-' || v_suffix;
  END LOOP;
  RETURN v_candidate;
END;
$$;

-- Brings one account's page in step with its Auth metadata, where the
-- username and avatar live and other viewers cannot read them.
CREATE FUNCTION public.upsert_public_profile(p_user_id uuid, p_metadata jsonb, p_joined_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_name text := nullif(left(btrim(p_metadata->>'username'), 80), '');
  v_avatar text := nullif(p_metadata->>'avatar_url', '');
  v_handle text;
BEGIN
  IF char_length(v_avatar) > 2000 THEN v_avatar := NULL; END IF;
  IF v_name IS NOT NULL THEN v_handle := public.public_profile_handle(v_name, p_user_id); END IF;
  BEGIN
    INSERT INTO public.public_profile (user_id, handle, display_name, avatar_url, created_at)
    VALUES (p_user_id, v_handle, v_name, v_avatar, coalesce(p_joined_at, timezone('utc'::text, now())))
    ON CONFLICT (user_id) DO UPDATE SET
      handle = coalesce(public.public_profile.handle, EXCLUDED.handle),
      display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url;
  EXCEPTION WHEN unique_violation THEN
    -- Two accounts took the same address at once: never fail a sign-up for it.
    INSERT INTO public.public_profile (user_id, handle, display_name, avatar_url, created_at)
    VALUES (p_user_id, CASE WHEN v_name IS NOT NULL THEN 'viewer-' || left(replace(p_user_id::text, '-', ''), 10) END, v_name, v_avatar,
      coalesce(p_joined_at, timezone('utc'::text, now())))
    ON CONFLICT (user_id) DO UPDATE SET
      handle = coalesce(public.public_profile.handle, EXCLUDED.handle),
      display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url;
  END;
END;
$$;

CREATE FUNCTION public.sync_public_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.upsert_public_profile(NEW.id, coalesce(NEW.raw_user_meta_data, '{}'::jsonb), NEW.created_at);
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_public_profile
  AFTER INSERT OR UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_public_profile();

-- Existing accounts, oldest first, so the earliest account keeps the plain address.
DO $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN SELECT id, raw_user_meta_data, created_at FROM auth.users ORDER BY created_at, id LOOP
    PERFORM public.upsert_public_profile(v_user.id, coalesce(v_user.raw_user_meta_data, '{}'::jsonb), v_user.created_at);
  END LOOP;
END;
$$;

ALTER TABLE public.public_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads public profiles" ON public.public_profile
  FOR SELECT TO anon, authenticated USING (
    (handle IS NOT NULL AND display_name IS NOT NULL) OR (SELECT auth.uid()) = user_id
  );
CREATE POLICY "Owners edit their profile" ON public.public_profile
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

-- The name and avatar follow the account, the address stays; the owner only writes the bio.
REVOKE ALL ON TABLE public.public_profile FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_profile TO anon, authenticated;
GRANT UPDATE (bio) ON TABLE public.public_profile TO authenticated;
GRANT ALL ON TABLE public.public_profile TO service_role;
REVOKE ALL ON FUNCTION public.public_profile_handle(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_public_profile(uuid, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_public_profile() FROM PUBLIC, anon, authenticated;

-- The profile lists the recaps a viewer unlocked and their attributed contributions.
CREATE INDEX recap_slide_suggestion_author_idx
  ON public.recap_slide_suggestion (created_by, created_at DESC);

NOTIFY pgrst, 'reload schema';
