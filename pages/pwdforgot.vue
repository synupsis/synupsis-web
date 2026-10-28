<template>
  <div class="w-full h-screen flex flex-col items-center justify-center p-4 bg-background">
    <div class="w-full max-w-md">
      <div class="flex justify-center mb-8">
        <Logo display-text size="md" :aria-label="t('Synupsis home')" />
      </div>
      <Card>
        <CardHeader class="text-center">
          <CardTitle>{{ t('Forgot Your Password?') }}</CardTitle>
          <CardDescription v-if="!emailSent">
            {{ t('No problem. Enter your email address and we\'ll send you a link to reset it.') }}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div v-if="emailSent" class="text-center space-y-4">
            <CircleCheckIcon class="h-16 w-16 text-green-500 mx-auto" />
            <p>{{ t('A password reset link has been sent to {email}.', { email }) }}</p>
            <p class="text-sm text-muted-foreground">{{ t('Please check your inbox and follow the instructions.') }}</p>
          </div>
          <form v-else @submit.prevent="sendResetInstructions">
            <div class="space-y-2">
              <label for="email" class="font-semibold">{{ t('Email Address') }}</label>
              <Input
                id="email"
                v-model="email"
                type="email"
                :placeholder="t('you@example.com')"
                required
              />
            </div>
          </form>
        </CardContent>
        <CardFooter class="flex flex-col gap-4">
          <Button
            v-if="!emailSent"
            class="w-full"
            :disabled="!email || isLoading"
            @click="sendResetInstructions"
          >
            <SpinLoader v-if="isLoading" class="h-4 w-4 mr-2" />
            {{ t('Send Reset Instructions') }}
          </Button>
          <Button variant="link" class="w-full" as-child>
            <router-link to="/login">{{ t('Back to Login') }}</router-link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  </div>
</template>

<script lang="ts" setup>
const { t } = useI18n();
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
import { CircleCheckIcon } from 'lucide-vue-next';

const supabase = useSupabaseClient();
const email = ref('');
const isLoading = ref(false);
const emailSent = ref(false);

const sendResetInstructions = async () => {
  if (!email.value) return;
  isLoading.value = true;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
      redirectTo: `${window.location.origin}/password-reset`
    });

    if (error) {
      toast.error(t('Error'), { description: t(error.message) });
    } else {
      emailSent.value = true;
    }
  } catch (e: any) {
    toast.error(t('An unexpected error occurred'), { description: t('Please try again.') });
  } finally {
    isLoading.value = false;
  }
};
</script>
