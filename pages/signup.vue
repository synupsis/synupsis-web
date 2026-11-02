<template>
  <AuthPageShell :title="t('Create an account')" :alternate-label="t('Log in')" alternate-to="/login">
    <form class="space-y-5" :aria-busy="isLoading" @submit.prevent="register">
      <div class="space-y-2">
        <label class="text-sm font-medium" for="signup-username">{{ t('Username') }}</label>
        <Input
          id="signup-username"
          v-model="username"
          name="username"
          type="text"
          autocomplete="username"
          autocapitalize="none"
          :spellcheck="false"
          :placeholder="t('Enter your username')"
          required
          :disabled="isLoading"
          class="h-12 rounded-lg border-border bg-background/70 px-4 text-base shadow-none focus-visible:border-foreground/40 focus-visible:ring-0"
        />
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium" for="signup-email">{{ t('Email') }}</label>
        <Input
          id="signup-email"
          v-model="email"
          name="email"
          type="email"
          inputmode="email"
          autocomplete="email"
          autocapitalize="none"
          :spellcheck="false"
          :placeholder="t('you@example.com')"
          required
          :disabled="isLoading"
          class="h-12 rounded-lg border-border bg-background/70 px-4 text-base shadow-none focus-visible:border-foreground/40 focus-visible:ring-0"
        />
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium" for="signup-password">{{ t('Password') }}</label>
        <AuthPasswordInput
          id="signup-password"
          v-model="password"
          autocomplete="new-password"
          :minlength="8"
          described-by="signup-password-help"
          :disabled="isLoading"
        />
        <p id="signup-password-help" class="text-xs text-muted-foreground">{{ t('At least 8 characters.') }}</p>
      </div>

      <p v-if="formError" role="alert" class="rounded-lg border border-red-400/30 bg-background/70 px-4 py-3 text-sm leading-relaxed text-red-400">
        {{ t(formError) }}
      </p>

      <Button
        :disabled="!email.trim() || !password || !username.trim() || isLoading"
        class="h-12 w-full rounded-lg bg-foreground text-sm font-semibold text-background hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        type="submit"
      >
        <LoaderCircle v-if="isLoading" class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span>{{ t(isLoading ? 'Creating account…' : 'Create account') }}</span>
      </Button>
      <p class="text-center text-xs leading-relaxed text-muted-foreground">
        {{ t('By creating an account, you accept the') }}
        <NuxtLink to="/terms" class="rounded-sm text-foreground underline decoration-muted-foreground/50 underline-offset-4 transition hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">{{ t('Terms of Service') }}</NuxtLink>
        {{ t('and the') }}
        <NuxtLink to="/privacy" class="rounded-sm text-foreground underline decoration-muted-foreground/50 underline-offset-4 transition hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">{{ t('Privacy Policy') }}</NuxtLink>.
      </p>
    </form>
    <p class="mt-10 border-t border-border pt-6 text-center text-sm text-muted-foreground">
      {{ t('Already have an account?') }}
      <NuxtLink to="/login" class="ml-1 inline-block rounded font-medium text-foreground underline decoration-muted-foreground/50 underline-offset-4 transition hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background">{{ t('Log in') }}</NuxtLink>
    </p>
  </AuthPageShell>
</template>

<script lang="ts" setup>
const { t } = useI18n();
import { LoaderCircle } from 'lucide-vue-next';
import AuthPageShell from '~/components/AuthPageShell.vue';
import AuthPasswordInput from '~/components/ui/AuthPasswordInput.vue';
import { Button } from '~/components/shadcn/button';
import { Input } from '~/components/shadcn/input';

useHead(() => ({ title: t('Sign up — Synupsis') }));

const supabase = useSupabaseClient();
const email = ref('');
const password = ref('');
const username = ref('');
const isLoading = ref(false);
const formError = ref('');

async function register() {
  if (isLoading.value) return;
  formError.value = '';

  const normalizedEmail = email.value.trim();
  const normalizedUsername = username.value.trim();
  if (!normalizedEmail || !normalizedUsername) {
    formError.value = 'Enter your username and email address.';
    return;
  }
  if (password.value.length < 8) {
    formError.value = 'Your password must be at least 8 characters long.';
    return;
  }

  isLoading.value = true;
  try {
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: password.value,
      options: {
        data: { username: normalizedUsername },
      },
    });
    if (signUpError) {
      formError.value = signUpError.message;
      return;
    }
    if (data.session) {
      await navigateTo('/');
      return;
    }
    if (!data.user) {
      formError.value = 'We couldn’t create your account. Please try again.';
      return;
    }
    await navigateTo({
      path: '/email-confirmation',
      query: { email: data.user.email ?? normalizedEmail },
    });
  } catch {
    formError.value = 'We couldn’t create your account. Please try again.';
  } finally {
    isLoading.value = false;
  }
}
</script>
