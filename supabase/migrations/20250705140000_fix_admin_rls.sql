-- Drop the old policies
DROP POLICY "Admins can view all profiles" ON public.profile;
DROP POLICY "Admins can update any profile" ON public.profile;

-- Create a function to check if a user is an admin
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profile WHERE id = user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the policies using the new function
CREATE POLICY "Admins can view all profiles" ON public.profile
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update any profile" ON public.profile
  FOR UPDATE USING (public.is_admin(auth.uid()));
