-- Drop the old, overly restrictive policies for the slide table
DROP POLICY "Users can view slides for recaps they own." ON public.slide;

-- Create the new, more flexible policy for viewing slides
CREATE POLICY "Slides are viewable if recap is published, or by owner."
ON public.slide
FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM public.recap
        WHERE
            recap.id = slide.recap_id AND
            (recap.status = 'published'::text OR recap.user_id = auth.uid())
    )
);
