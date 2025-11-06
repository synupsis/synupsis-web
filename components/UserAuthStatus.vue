<template>
  <ClientOnly>
    <div v-if="user" class="flex gap-4 items-center justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" class="flex items-center gap-2">
            <Avatar class="h-8 w-8">
              <AvatarImage v-if="user.user_metadata.avatar_url" :src="user.user_metadata.avatar_url" :alt="user.user_metadata.username" />
              <AvatarFallback>{{ user.user_metadata.username.charAt(0) }}</AvatarFallback>
            </Avatar>
            <span>{{ user.user_metadata.username }}</span>
          </Button>
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/shadcn/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/shadcn/avatar'
import SpinLoader from '~/components/ui/SpinLoader.vue';

const user = useSupabaseUser();
const router = useRouter();
const supabase = useSupabaseClient();
const isAdmin = ref(false);

watchEffect(async () => {
  if (user.value) {
    const { data } = await supabase
      .from('user_profiles')
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
