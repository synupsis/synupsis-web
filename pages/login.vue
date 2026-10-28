<template>
  <AuthPageShell :title="t('Welcome back')" :alternate-label="t('Sign up')" alternate-to="/signup">
    <form class="space-y-5" :aria-busy="isLoading" @submit.prevent="login">
      <div class="space-y-2">
        <label class="text-sm font-medium" for="email">{{ t('Email') }}</label>
        <Input
          id="email"
          v-model="email"
          name="email"
          :placeholder="t('you@example.com')"
          type="email"
          autocomplete="email"
          autocapitalize="off"
          :spellcheck="false"
          required
          :disabled="isLoading"
          class="h-12 rounded-xl border-border bg-muted/20 px-4 text-base shadow-none focus-visible:border-violet-400/70 focus-visible:ring-4 focus-visible:ring-violet-400/10"
        />
      </div>
      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <label class="text-sm font-medium" for="password">{{ t('Password') }}</label>
          <NuxtLink to="/pwdforgot" class="rounded text-xs text-muted-foreground transition hover:text-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background">{{ t('Forgot password?') }}</NuxtLink>
        </div>
        <AuthPasswordInput id="password" v-model="password" autocomplete="current-password" :disabled="isLoading" />
      </div>

      <p v-if="errorMessage" role="alert" class="rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm leading-relaxed text-red-400">{{ t(errorMessage) }}</p>

      <Button
        :disabled="!email.trim() || !password || isLoading"
        class="h-12 w-full rounded-xl bg-violet-500 text-sm font-semibold text-white shadow-sm shadow-violet-950/20 hover:bg-violet-400 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        type="submit"
      >
        <LoaderCircle v-if="isLoading" class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span>{{ t(isLoading ? 'Logging in…' : 'Log in') }}</span>
        <ArrowRight v-if="!isLoading" class="size-4" aria-hidden="true" />
      </Button>
      <p class="border-t border-border pt-5 text-center text-sm text-muted-foreground">
        {{ t('No account yet?') }}
        <NuxtLink class="ml-1 inline-block rounded font-medium text-violet-400 transition hover:text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background" to="/signup">{{ t('Sign up') }}</NuxtLink>
      </p>
    </form>
  </AuthPageShell>
</template>

<script lang="ts" setup>
const { t } = useI18n();
import { ArrowRight, LoaderCircle } from 'lucide-vue-next';
import AuthPageShell from '~/components/AuthPageShell.vue';
import AuthPasswordInput from '~/components/ui/AuthPasswordInput.vue';
import { Input } from '~/components/shadcn/input';
import { Button } from '~/components/shadcn/button';

useHead(() => ({ title: t('Log in — Synupsis') }));

const supabase = useSupabaseClient();
const email = ref('');
const password = ref('');
const isLoading = ref(false);
const errorMessage = ref('');
const route = useRoute();
// Only paths on this site: an absolute or protocol-relative address would send the viewer away.
const redirectPath = computed(() => {
  const redirect = route.query.redirect;
  return typeof redirect === 'string' && /^\/(?![/\\])/.test(redirect) ? redirect : '/';
});

async function login() {
  if (isLoading.value || !email.value.trim() || !password.value) return;
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    });
    if (error) {
      errorMessage.value = error.message;
      return;
    }
    await navigateTo(redirectPath.value);
  } catch {
    errorMessage.value = 'Unable to log in right now. Please try again.';
  } finally {
    isLoading.value = false;
  }
}
</script>
