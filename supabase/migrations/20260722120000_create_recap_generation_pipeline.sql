-- Keep manually-authored recaps compatible while introducing canonical,
-- system-generated recap versions.
ALTER TABLE public.recap
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN locale text NOT NULL DEFAULT 'fr',
  ADD COLUMN format_version integer NOT NULL DEFAULT 1,
  ADD COLUMN is_canonical boolean NOT NULL DEFAULT false,
  ADD COLUMN source_snapshot jsonb,
  ADD COLUMN story_data jsonb,
  ADD COLUMN quality_report jsonb,
  ADD COLUMN model text,
  ADD COLUMN prompt_version text;

CREATE UNIQUE INDEX recap_one_published_canonical_version
  ON public.recap (season_id, locale, format_version)
  WHERE is_canonical = true AND status = 'published';

CREATE TABLE public.recap_generation_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  started_at timestamptz,
  completed_at timestamptz,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  show_id uuid NOT NULL REFERENCES public.show(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.season(id) ON DELETE CASCADE,
  recap_id uuid REFERENCES public.recap(id) ON DELETE SET NULL,
  prompt_id uuid REFERENCES public.prompts(id) ON DELETE SET NULL,
  locale text NOT NULL DEFAULT 'fr',
  format_version integer NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN (
      'queued',
      'gathering',
      'generating',
      'validating',
      'rendering',
      'needs_review',
      'completed',
      'failed',
      'cancelled'
    )
  ),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  provider_response_id text,
  model text NOT NULL,
  prompt_version text NOT NULL,
  source_snapshot jsonb,
  story_data jsonb,
  quality_report jsonb,
  error_code text,
  error_message text
);

CREATE UNIQUE INDEX recap_generation_one_active_job
  ON public.recap_generation_job (season_id, locale, format_version)
  WHERE status IN ('queued', 'gathering', 'generating', 'validating', 'rendering');

CREATE INDEX recap_generation_job_requested_by_idx
  ON public.recap_generation_job (requested_by, created_at DESC);

ALTER TABLE public.recap_generation_job ENABLE ROW LEVEL SECURITY;

-- Direct database access is limited to the requester. The authenticated API
-- may still let another user join an existing job when it returns its UUID.
CREATE POLICY "Users can view their own recap generation jobs"
  ON public.recap_generation_job
  FOR SELECT
  TO authenticated
  USING (requested_by = auth.uid());

-- Publishing generated content and its slides must be atomic. This function is
-- only callable with the server-side service role.
CREATE OR REPLACE FUNCTION public.publish_generated_recap(
  p_show_id uuid,
  p_season_id uuid,
  p_locale text,
  p_format_version integer,
  p_source_snapshot jsonb,
  p_story_data jsonb,
  p_quality_report jsonb,
  p_prompt_id uuid,
  p_model text,
  p_prompt_version text,
  p_slides jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recap_id uuid;
BEGIN
  SELECT id
  INTO v_recap_id
  FROM public.recap
  WHERE season_id = p_season_id
    AND locale = p_locale
    AND format_version = p_format_version
    AND is_canonical = true
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_recap_id IS NULL THEN
    INSERT INTO public.recap (
      show_id,
      season_id,
      user_id,
      status,
      prompt_id,
      locale,
      format_version,
      is_canonical,
      source_snapshot,
      story_data,
      quality_report,
      model,
      prompt_version
    )
    VALUES (
      p_show_id,
      p_season_id,
      NULL,
      'published',
      p_prompt_id,
      p_locale,
      p_format_version,
      true,
      p_source_snapshot,
      p_story_data,
      p_quality_report,
      p_model,
      p_prompt_version
    )
    RETURNING id INTO v_recap_id;
  ELSE
    UPDATE public.recap
    SET show_id = p_show_id,
        status = 'published',
        prompt_id = p_prompt_id,
        source_snapshot = p_source_snapshot,
        story_data = p_story_data,
        quality_report = p_quality_report,
        model = p_model,
        prompt_version = p_prompt_version
    WHERE id = v_recap_id;

    DELETE FROM public.slide WHERE recap_id = v_recap_id;
  END IF;

  INSERT INTO public.slide (recap_id, "order", canvas_data)
  SELECT
    v_recap_id,
    COALESCE((slide_item->>'order')::integer, slide_ordinality::integer),
    slide_item->'canvas'
  FROM jsonb_array_elements(p_slides) WITH ORDINALITY AS slides(slide_item, slide_ordinality);

  RETURN v_recap_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_generated_recap(
  uuid, uuid, text, integer, jsonb, jsonb, jsonb, uuid, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.publish_generated_recap(
  uuid, uuid, text, integer, jsonb, jsonb, jsonb, uuid, text, text, jsonb
) TO service_role;
