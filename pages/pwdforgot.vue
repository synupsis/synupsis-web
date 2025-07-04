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
          <CardTitle>Forgot Your Password?</CardTitle>
          <CardDescription>
            No problem. Enter your email address and we'll send you a link to reset it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form @submit.prevent="sendResetInstructions">
            <div class="space-y-2">
              <label for="email" class="font-semibold">Email Address</label>
              <Input
                id="email"
                v-model="email"
                type="email"
                placeholder="you@example.com"
                required
              />
            </div>
          </form>
        </CardContent>
        <CardFooter class="flex flex-col gap-4">
          <Button
            class="w-full"
            :disabled="!email || isLoading"
            @click="sendResetInstructions"
          >
            <SpinLoader v-if="isLoading" class="h-4 w-4 mr-2" />
            Send Reset Instructions
          </Button>
          <Button variant="link" class="w-full" as-child>
            <router-link to="/login">Back to Login</router-link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { toast } from 'vue-sonner'
import { Button } from '~/components/shadcn/button'
import { Input } from '~/components/shadcn/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/shadcn/card'
import SpinLoader from '~/components/ui/SpinLoader.vue';

const supabase = useSupabaseClient();
const email = ref('');
const isLoading = ref(false);

const sendResetInstructions = async () => {
  if (!email.value) return;
  isLoading.value = true;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
      redirectTo: `${window.location.origin}/password-reset` // This should be a valid page in your app
    });

    if (error) {
      toast.error('Error', { description: error.message });
    } else {
      toast.success('Check your email', {
        description: 'A password reset link has been sent to your email address.'
      });
    }
  } catch (e: any) {
    toast.error('An unexpected error occurred', { description: e.message });
  } finally {
    isLoading.value = false;
  }
};
</script>
