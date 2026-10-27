<template>
  <AuthPageShell title="Create an account" alternate-label="Log in" alternate-to="/login">
    <form class="space-y-5" :aria-busy="isLoading" @submit.prevent="register">
      <div class="space-y-2">
        <label class="text-sm font-medium" for="signup-username">Username</label>
        <Input
          id="signup-username"
          v-model="username"
          name="username"
          type="text"
          autocomplete="username"
          autocapitalize="none"
          :spellcheck="false"
          placeholder="Enter your username"
          required
          :disabled="isLoading"
          class="h-12 rounded-xl border-border bg-muted/20 px-4 text-base shadow-none focus-visible:border-violet-400/70 focus-visible:ring-4 focus-visible:ring-violet-400/10"
        />
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium" for="signup-email">Email</label>
        <Input
          id="signup-email"
          v-model="email"
          name="email"
          type="email"
          inputmode="email"
          autocomplete="email"
          autocapitalize="none"
          :spellcheck="false"
          placeholder="you@example.com"
          required
          :disabled="isLoading"
          class="h-12 rounded-xl border-border bg-muted/20 px-4 text-base shadow-none focus-visible:border-violet-400/70 focus-visible:ring-4 focus-visible:ring-violet-400/10"
        />
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium" for="signup-password">Password</label>
        <AuthPasswordInput
          id="signup-password"
          v-model="password"
          autocomplete="new-password"
          :minlength="8"
          described-by="signup-password-help"
          :disabled="isLoading"
        />
        <p id="signup-password-help" class="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>

      <p v-if="formError" role="alert" class="rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm leading-relaxed text-red-400">
        {{ formError }}
      </p>

      <Button
        :disabled="!email.trim() || !password || !username.trim() || isLoading"
        class="h-12 w-full rounded-xl bg-violet-500 text-sm font-semibold text-white shadow-sm shadow-violet-950/20 hover:bg-violet-400 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        type="submit"
      >
        <LoaderCircle v-if="isLoading" class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span>{{ isLoading ? 'Creating account…' : 'Create account' }}</span>
        <ArrowRight v-if="!isLoading" class="size-4" aria-hidden="true" />
      </Button>

      <p class="border-t border-border pt-5 text-center text-sm text-muted-foreground">
        Already have an account?
        <NuxtLink to="/login" class="ml-1 inline-block rounded font-medium text-violet-400 transition hover:text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background">Log in</NuxtLink>
      </p>
    </form>
  </AuthPageShell>
</template>

<script lang="ts" setup>
import { ArrowRight, LoaderCircle } from 'lucide-vue-next';
import AuthPageShell from '~/components/AuthPageShell.vue';
import AuthPasswordInput from '~/components/ui/AuthPasswordInput.vue';
import { Button } from '~/components/shadcn/button';
import { Input } from '~/components/shadcn/input';

useHead({ title: 'Sign up — Synupsis' });

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
