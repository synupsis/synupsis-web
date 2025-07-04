<template>
  <ClientOnly>
    <div v-if="user" class="flex gap-4 items-center justify-end">
      <router-link to="/profile">
        <p class="text-sm text-muted-foreground hover:text-foreground transition-colors">{{ user.email }}</p>
      </router-link>
      <Button variant="ghost" @click="logout">Log out</Button>
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
import SpinLoader from '~/components/ui/SpinLoader.vue';

const user = useSupabaseUser();
const router = useRouter();
const supabase = useSupabaseClient();

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
