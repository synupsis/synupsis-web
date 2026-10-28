-- A spoiler preference belongs to one viewer and one series, independently of
-- their progress. Existing library entries keep protection enabled by default.
ALTER TABLE public.library_entry
  ADD COLUMN spoiler_shield_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.library_entry.spoiler_shield_enabled IS
  'Whether to hide content beyond this viewer''s progress in this series.';

NOTIFY pgrst, 'reload schema';
