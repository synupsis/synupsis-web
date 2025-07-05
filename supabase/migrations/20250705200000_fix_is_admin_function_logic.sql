-- The previous version of this function was comparing auth.uid() against profile.id (the primary key)
-- instead of profile.user_id (the foreign key to auth.users). This version corrects the logic.
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profile WHERE user_id = p_user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply the policy to ensure it uses the updated function.
-- The policy logic itself is correct, but this ensures consistency.
DROP POLICY IF EXISTS "Recaps are viewable by everyone if published, or by owner/admin if draft." ON public.recap;
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