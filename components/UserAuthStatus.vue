<template>
  <ClientOnly>
    <div v-if="user" class="flex gap-4 items-center justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost">{{ user.email }}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem @click="router.push('/profile')">
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem v-if="isAdmin" @click="router.push('/admin')">
            Admin Panel
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem @click="logout">
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div v-else class="flex gap-4 items-center justify-end">
      <Button variant="ghost" @click="goToLogin">Log in</Button>
      <Button @click="goToSignup">Sign up</Button>
    </div>
    <template #fallback>
      <div class="w-full h-9 flex justify-end items-center">
        <SpinLoader class="h-5 w-5" />
      </div>
    </template>
  </ClientOnly>
</template>

<script lang="ts" setup>
import { ref, watchEffect } from 'vue';
import { Button } from '~/components/shadcn/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/shadcn/dropdown-menu'
import SpinLoader from '~/components/ui/SpinLoader.vue';

const user = useSupabaseUser();
const router = useRouter();
const supabase = useSupabaseClient();
const isAdmin = ref(false);

watchEffect(async () => {
  if (user.value) {
    const { data } = await supabase
      .from('profile')
      .select('role')
      .eq('user_id', user.value.id)
      .single();
    isAdmin.value = data?.role === 'admin';
  }
});

function goToLogin() {
  router.push('/login');
}

function goToSignup() {
  router.push('/signup');
}

async function logout() {
  await supabase.auth.signOut();
  await navigateTo('/');
}
</script>
