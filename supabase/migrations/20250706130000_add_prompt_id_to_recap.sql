ALTER TABLE public.recap
ADD COLUMN prompt_id uuid REFERENCES public.prompts(id) ON DELETE SET NULL;