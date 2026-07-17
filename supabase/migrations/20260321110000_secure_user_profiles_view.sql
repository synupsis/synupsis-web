ALTER VIEW public.user_profiles SET (security_invoker = true);

REVOKE ALL ON TABLE public.user_profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.user_profiles FROM anon;
REVOKE ALL ON TABLE public.user_profiles FROM authenticated;

GRANT SELECT ON TABLE public.user_profiles TO service_role;
