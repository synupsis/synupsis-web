export default defineNuxtRouteMiddleware(async () => {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();

  if (!user.value) {
    return navigateTo('/login');
  }

  const { data, error } = await supabase
    .from('profile')
    .select('role')
    .eq('user_id', user.value.id)
    .single();

  if (error || data?.role !== 'admin') {
    return navigateTo('/');
  }
});
