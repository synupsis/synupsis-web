<template>
  <div class="w-full min-h-screen bg-background text-foreground">
    <header class="flex w-full justify-between items-center py-6 px-8 border-b">
      <router-link to="/">
        <Logo class="h-24 w-24" />
      </router-link>
      <UserAuthStatus />
    </header>
    <main class="flex justify-center p-8">
      <Card v-if="user" class="w-full max-w-md">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>View and manage your account details.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-1">
            <p class="text-sm font-medium text-muted-foreground">Username</p>
            <p>{{ user.user_metadata.username }}</p>
          </div>
          <div class="space-y-1">
            <p class="text-sm font-medium text-muted-foreground">Email</p>
            <p>{{ user.email }}</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="destructive" @click="logout">Log Out</Button>
        </CardFooter>
      </Card>
    </main>
  </div>
</template>

<script lang="ts" setup>
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/shadcn/card'
import { Button } from '~/components/shadcn/button'
import UserAuthStatus from '~/components/UserAuthStatus.vue';

const user = useSupabaseUser();
const supabase = useSupabaseClient();
const router = useRouter();

async function logout() {
  await supabase.auth.signOut();
  await router.push('/');
}
</script>
