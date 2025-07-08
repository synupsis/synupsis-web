-- Drop the existing policy to replace it
DROP POLICY "Recaps are viewable by everyone if published, or by owner if draft." ON public.recap;

-- Create a new policy that includes a check for the admin role
CREATE POLICY "Recaps are viewable by everyone if published, or by owner/admin if draft."
ON public.recap
FOR SELECT
USING (
  (status = 'published'::text)
  OR
  (auth.uid() = user_id)
  OR
  (public.is_admin(auth.uid()))
);
