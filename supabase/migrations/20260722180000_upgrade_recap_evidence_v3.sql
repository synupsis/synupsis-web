-- Upgrade databases where the initial recap pipeline migration was already
-- applied before the v3 Evidence Pack added source_snapshot to published recaps.
ALTER TABLE public.recap
  ADD COLUMN IF NOT EXISTS source_snapshot jsonb;

ALTER TABLE public.recap_generation_job
  ALTER COLUMN format_version SET DEFAULT 3;

-- PostgreSQL identifies functions by name and argument types. Drop the v2
-- overload explicitly so PostgREST cannot keep advertising the stale contract.
DROP FUNCTION IF EXISTS public.publish_generated_recap(
  uuid, uuid, text, integer, jsonb, jsonb, uuid, text, text, jsonb
);

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

NOTIFY pgrst, 'reload schema';
