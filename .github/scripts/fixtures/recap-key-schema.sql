CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

-- Only unrelated catalog/auth columns are omitted. Production functions and
-- key constraints/triggers are loaded directly from the actual migrations.
CREATE TABLE public.recap (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL, season_id uuid NOT NULL, user_id uuid,
  status text NOT NULL, prompt_id uuid, locale text NOT NULL,
  format_version integer NOT NULL, is_canonical boolean NOT NULL DEFAULT false,
  source_snapshot jsonb, event_graph jsonb, story_data jsonb, quality_report jsonb,
  model text, prompt_version text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX recap_one_published_canonical_version
  ON public.recap (season_id, locale, format_version)
  WHERE is_canonical AND status = 'published';
CREATE TABLE public.slide (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recap_id uuid NOT NULL REFERENCES public.recap(id) ON DELETE CASCADE,
  "order" integer NOT NULL, canvas_data jsonb
);
CREATE TABLE public.recap_generation_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  show_id uuid NOT NULL, season_id uuid NOT NULL, locale text NOT NULL,
  format_version integer NOT NULL DEFAULT 10, status text NOT NULL,
  model text NOT NULL DEFAULT 'test', prompt_version text NOT NULL DEFAULT 'test', prompt_id uuid,
  source_snapshot jsonb, event_graph jsonb, story_data jsonb, quality_report jsonb,
  progress integer NOT NULL DEFAULT 0, recap_id uuid REFERENCES public.recap(id),
  error_code text, error_message text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
