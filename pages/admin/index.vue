<template>
  <div class="w-full min-h-screen bg-background text-foreground">
    <header class="flex w-full justify-between items-center py-6 px-8 border-b">
      <router-link to="/">
        <img src="/svg/logo_text.svg" alt="Synupsis Logo" class="h-8" />
      </router-link>
      <UserAuthStatus />
    </header>
    <main class="p-8">
      <div class="container mx-auto py-10">
        <h1 class="text-3xl font-bold mb-4">Admin - User Management</h1>
        <ClientOnly>
          <div v-if="pending" class="border rounded-md p-4">
            <div class="h-12 bg-muted/40 rounded-md animate-pulse mb-4" />
            <div class="space-y-2">
              <div v-for="i in 5" :key="i" class="h-10 bg-muted/40 rounded-md animate-pulse" />
            </div>
          </div>
          <DataTable v-else :columns="columns" :data="users" @refresh="fetchUsers" />
        </ClientOnly>
      </div>
    </main>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import DataTable from '~/components/admin/DataTable.vue';
import { columns } from '~/components/admin/columns';
import UserAuthStatus from '~/components/UserAuthStatus.vue';
import Logo from '~/components/Logo.vue';

definePageMeta({
  middleware: 'admin'
});

const supabase = useSupabaseClient();
const users = ref([]);
const pending = ref(true);

async function fetchUsers() {
  pending.value = true;
  const { data, error } = await supabase.from('user_profiles').select('*');
  if (error) {
    console.error('Error fetching users:', error);
  } else {
    users.value = data;
  }
  pending.value = false;
}

onMounted(fetchUsers);
</script>
