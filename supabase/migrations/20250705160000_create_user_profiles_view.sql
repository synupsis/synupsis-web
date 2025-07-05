-- 1. Create the view
CREATE OR REPLACE VIEW public.user_profiles AS
SELECT
  p.id,
  p.user_id,
  p.role,
  u.email
FROM
  public.profile p
JOIN
  auth.users u ON p.user_id = u.id;

-- 2. Secure the view
ALTER VIEW public.user_profiles OWNER TO postgres;
