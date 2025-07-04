<template>
  <div class="w-full h-screen flex flex-col items-center justify-center p-4 bg-background">
    <div class="w-full max-w-md">
      <div class="flex justify-center mb-8">
        <router-link to="/">
          <Logo class="h-24 w-24" />
        </router-link>
      </div>
      <Card>
        <CardHeader class="text-center">
          <CardTitle>Create a New Password</CardTitle>
          <CardDescription>
            Choose a new password for your account. Make sure it's at least 8 characters long.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form class="space-y-4" @submit.prevent="updatePassword">
            <div>
              <label for="password" class="font-semibold">New Password</label>
              <Input
                id="password"
                v-model="password"
                type="password"
                placeholder="Enter your new password"
                required
              />
            </div>
            <div>
              <label for="confirmPassword" class="font-semibold">Confirm New Password</label>
              <Input
                id="confirmPassword"
                v-model="confirmPassword"
                type="password"
                placeholder="Confirm your new password"
                required
              />
            </div>
          </form>
        </CardContent>
        <CardFooter class="flex flex-col gap-4">
          <Button
            class="w-full"
            :disabled="!password || !confirmPassword || isLoading"
            @click="updatePassword"
          >
            <SpinLoader v-if="isLoading" class="h-4 w-4 mr-2" />
            Update Password
          </Button>
        </CardFooter>
      </Card>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { toast } from 'vue-sonner';
import { Button } from '~/components/shadcn/button';
import { Input } from '~/components/shadcn/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/shadcn/card';
import SpinLoader from '~/components/ui/SpinLoader.vue';

const supabase = useSupabaseClient();
const router = useRouter();

const password = ref('');
const confirmPassword = ref('');
const isLoading = ref(false);

const updatePassword = async () => {
  if (password.value !== confirmPassword.value) {
    toast.error('Passwords do not match.');
    return;
  }
  if (password.value.length < 8) {
    toast.error('Password is too short.', {
      description: 'Please use at least 8 characters.',
    });
    return;
  }

  isLoading.value = true;
  try {
    const { error } = await supabase.auth.updateUser({ password: password.value });

    if (error) {
      toast.error('Error updating password', { description: error.message });
    } else {
      toast.success('Password updated successfully!', {
        description: 'You can now log in with your new password.',
      });
      router.push('/login');
    }
  } catch (e: any) {
    toast.error('An unexpected error occurred', { description: e.message });
  } finally {
    isLoading.value = false;
  }
};
</script>
