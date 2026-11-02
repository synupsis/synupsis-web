<template>
  <AuthPageShell :title="t('Create a New Password')" :alternate-label="t('Log in')" alternate-to="/login">
    <div v-if="passwordUpdated" role="status" class="space-y-6 text-center">
      <div class="space-y-3">
        <p class="font-semibold">{{ t('Password Updated!') }}</p>
        <p class="text-sm text-muted-foreground">{{ t('You can now log in with your new password.') }}</p>
      </div>
      <Button as-child class="h-12 w-full rounded-lg bg-foreground text-sm font-semibold text-background hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <NuxtLink to="/login">{{ t('Go to Login') }}</NuxtLink>
      </Button>
    </div>
    <form v-else class="space-y-5" :aria-busy="isLoading" @submit.prevent="updatePassword">
      <p class="text-center text-sm text-muted-foreground">{{ t('Choose a new password for your account. Make sure it\'s at least 8 characters long.') }}</p>
      <div class="space-y-2">
        <label for="password" class="text-sm font-medium">{{ t('New Password') }}</label>
        <AuthPasswordInput id="password" v-model="password" autocomplete="new-password" :minlength="8" :placeholder="t('Enter your new password')" :disabled="isLoading" />
      </div>
      <div class="space-y-2">
        <label for="confirmPassword" class="text-sm font-medium">{{ t('Confirm New Password') }}</label>
        <AuthPasswordInput id="confirmPassword" v-model="confirmPassword" autocomplete="new-password" :minlength="8" :placeholder="t('Confirm your new password')" :disabled="isLoading" />
      </div>
      <Button :disabled="!password || !confirmPassword || isLoading" type="submit" class="h-12 w-full rounded-lg bg-foreground text-sm font-semibold text-background hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <LoaderCircle v-if="isLoading" class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {{ t('Update Password') }}
      </Button>
    </form>
  </AuthPageShell>
</template>

<script lang="ts" setup>
const { t } = useI18n();
import { ref } from 'vue';
import { toast } from 'vue-sonner';
import { Button } from '~/components/shadcn/button';
import AuthPageShell from '~/components/AuthPageShell.vue';
import AuthPasswordInput from '~/components/ui/AuthPasswordInput.vue';
import { LoaderCircle } from 'lucide-vue-next';

const supabase = useSupabaseClient();

const password = ref('');
const confirmPassword = ref('');
const isLoading = ref(false);
const passwordUpdated = ref(false);

const updatePassword = async () => {
  if (password.value !== confirmPassword.value) {
    toast.error(t('Passwords do not match.'));
    return;
  }
  if (password.value.length < 8) {
    toast.error(t('Password is too short.'), {
      description: t('Please use at least 8 characters.'),
    });
    return;
  }

  isLoading.value = true;
  try {
    const { error } = await supabase.auth.updateUser({ password: password.value });

    if (error) {
      toast.error(t('Error updating password'), { description: t(error.message) });
    } else {
      passwordUpdated.value = true;
    }
  } catch (e: any) {
    toast.error(t('An unexpected error occurred'), { description: t('Please try again.') });
  } finally {
    isLoading.value = false;
  }
};
</script>
