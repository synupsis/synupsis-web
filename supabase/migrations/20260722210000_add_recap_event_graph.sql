-- Recap v4 separates factual event extraction from story writing. The event
-- graph is persisted independently so it can be audited and reused by future
-- recap formats without re-ingesting source documents.
ALTER TABLE public.recap
  ADD COLUMN IF NOT EXISTS event_graph jsonb;

ALTER TABLE public.recap_generation_job
  ADD COLUMN IF NOT EXISTS event_graph jsonb,
  ADD COLUMN IF NOT EXISTS prompt_template text,
  ADD COLUMN IF NOT EXISTS generation_phase text NOT NULL DEFAULT 'extracting_events'
    CHECK (generation_phase IN ('extracting_events', 'preparing_story', 'writing_story'));

-- A v3 provider response contains a finished story, not an event graph. Mark
-- in-flight jobs explicitly so a deployment cannot reinterpret that payload.
UPDATE public.recap_generation_job
SET status = 'failed',
    progress = 100,
    error_code = 'pipeline_upgraded_to_v4',
    error_message = 'The recap pipeline changed while this job was running. Start a new generation.',
    completed_at = now(),
    updated_at = now()
WHERE format_version < 4
  AND status IN ('queued', 'gathering', 'generating', 'validating', 'rendering');

ALTER TABLE public.recap_generation_job
  ALTER COLUMN format_version SET DEFAULT 4;

DROP FUNCTION IF EXISTS public.publish_generated_recap(
  uuid, uuid, text, integer, jsonb, jsonb, jsonb, uuid, text, text, jsonb
);

CREATE OR REPLACE FUNCTION public.publish_generated_recap(
  p_show_id uuid,
  p_season_id uuid,
  p_locale text,
  p_format_version integer,
  p_source_snapshot jsonb,
  p_event_graph jsonb,
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
      event_graph,
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
      p_event_graph,
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
        event_graph = p_event_graph,
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
  uuid, uuid, text, integer, jsonb, jsonb, jsonb, jsonb, uuid, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.publish_generated_recap(
  uuid, uuid, text, integer, jsonb, jsonb, jsonb, jsonb, uuid, text, text, jsonb
) TO service_role;

NOTIFY pgrst, 'reload schema';
