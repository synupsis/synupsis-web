<template>
  <AuthPageShell :title="t('Forgot Your Password?')" :alternate-label="t('Log in')" alternate-to="/login">
    <div v-if="emailSent" role="status" class="space-y-3 text-center">
      <p>{{ t('A password reset link has been sent to {email}.', { email }) }}</p>
      <p class="text-sm text-muted-foreground">{{ t('Please check your inbox and follow the instructions.') }}</p>
    </div>
    <form v-else class="space-y-5" :aria-busy="isLoading" @submit.prevent="sendResetInstructions">
      <p class="text-center text-sm text-muted-foreground">{{ t('No problem. Enter your email address and we\'ll send you a link to reset it.') }}</p>
      <div class="space-y-2">
        <label for="email" class="text-sm font-medium">{{ t('Email') }}</label>
        <Input
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          autocapitalize="off"
          :spellcheck="false"
          :placeholder="t('you@example.com')"
          required
          :disabled="isLoading"
          class="h-12 rounded-lg border-border bg-background/70 px-4 text-base shadow-none focus-visible:border-foreground/40 focus-visible:ring-0"
        />
      </div>
      <Button :disabled="!email || isLoading" type="submit" class="h-12 w-full rounded-lg bg-foreground text-sm font-semibold text-background hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <LoaderCircle v-if="isLoading" class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {{ t('Send Reset Instructions') }}
      </Button>
    </form>
    <p class="mt-10 border-t border-border pt-6 text-center text-sm text-muted-foreground">
      <NuxtLink to="/login" class="rounded font-medium text-foreground underline decoration-muted-foreground/50 underline-offset-4 transition hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background">{{ t('Back to Login') }}</NuxtLink>
    </p>
  </AuthPageShell>
</template>

<script lang="ts" setup>
const { t } = useI18n();
import { ref } from 'vue';
import { toast } from 'vue-sonner'
import { Button } from '~/components/shadcn/button'
import { Input } from '~/components/shadcn/input'
import AuthPageShell from '~/components/AuthPageShell.vue';
import { LoaderCircle } from 'lucide-vue-next';

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
