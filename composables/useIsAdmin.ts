import { ref, watch } from 'vue';
import type { Database } from '~/types/database.types';

export function useIsAdmin() {
  const user = useSupabaseUser();
  const supabase = useSupabaseClient<Database>();
  const isAdmin = ref(false);

  watch(
    user,
    async (currentUser) => {
      if (!currentUser) {
        isAdmin.value = false;
        return;
      }

      const { data, error } = await supabase
        .from('profile')
        .select('role')
        .eq('user_id', currentUser.id)
        .single();

      if (error) {
        console.error('Failed to fetch admin role:', error);
        isAdmin.value = false;
        return;
      }

      isAdmin.value = data.role === 'admin';
    },
    { immediate: true },
  );

  return isAdmin;
}
