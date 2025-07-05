-- Create the profile table
CREATE TABLE public.profile (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Function to create a profile for a new user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profile (id, role)
  VALUES (new.id, 'user');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function when a new user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Enable RLS for the profile table
ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;

-- Policies for the profile table
CREATE POLICY "Users can view their own profile" ON public.profile
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profile
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profile WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admins can update any profile" ON public.profile
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.profile WHERE id = auth.uid() AND role = 'admin'
  ));
