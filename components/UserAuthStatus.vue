<template>
  <ClientOnly>
    <div v-if="user" class="flex gap-4 items-center justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" class="flex items-center gap-2">
            <Avatar class="h-8 w-8">
              <AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="displayName" />
              <AvatarFallback>{{ displayName.charAt(0) }}</AvatarFallback>
            </Avatar>
            <span>{{ displayName }}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{{ displayName }}</DropdownMenuLabel>
          <DropdownMenuSeparator />
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
const isAdmin = useIsAdmin();
const userMetadata = computed<Record<string, unknown>>(() => user.value?.user_metadata ?? {});
const displayName = computed(() => {
  const username = userMetadata.value.username;
  return typeof username === 'string' && username ? username : (user.value?.email ?? 'User');
});
const avatarUrl = computed(() => {
  const value = userMetadata.value.avatar_url;
  return typeof value === 'string' ? value : '';
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
