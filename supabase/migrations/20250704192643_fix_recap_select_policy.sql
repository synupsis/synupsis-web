-- Drop the old, overly restrictive policy
DROP POLICY "Users can view their own recaps." ON public.recap;

-- Create the new, more flexible policy
CREATE POLICY "Recaps are viewable by everyone if published, or by owner if draft."
ON public.recap
FOR SELECT
USING (
  (status = 'published'::text) OR (auth.uid() = user_id)
);
