<template>
  <div class="w-full h-screen flex flex-col items-center justify-center p-4 bg-background">
    <div class="w-full max-w-md">
      <div class="flex justify-center mb-8">
        <Logo size="xl" />
      </div>
      <Card>
        <CardHeader class="text-center">
          <CardTitle>Create a New Password</CardTitle>
          <CardDescription v-if="!passwordUpdated">
            Choose a new password for your account. Make sure it's at least 8 characters long.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div v-if="passwordUpdated" class="text-center space-y-4">
            <CircleCheckIcon class="h-16 w-16 text-green-500 mx-auto" />
            <p class="text-lg font-semibold">Password Updated!</p>
            <p class="text-sm text-muted-foreground">You can now log in with your new password.</p>
          </div>
          <form v-else class="space-y-4" @submit.prevent="updatePassword">
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
            v-if="!passwordUpdated"
            class="w-full"
            :disabled="!password || !confirmPassword || isLoading"
            @click="updatePassword"
          >
            <SpinLoader v-if="isLoading" class="h-4 w-4 mr-2" />
            Update Password
          </Button>
          <Button v-else class="w-full" as-child>
            <router-link to="/login">Go to Login</router-link>
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
import { CircleCheckIcon } from 'lucide-vue-next';

const supabase = useSupabaseClient();

const password = ref('');
const confirmPassword = ref('');
const isLoading = ref(false);
const passwordUpdated = ref(false);

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
      passwordUpdated.value = true;
    }
  } catch (e: any) {
    toast.error('An unexpected error occurred', { description: e.message });
  } finally {
    isLoading.value = false;
  }
};
</script>
