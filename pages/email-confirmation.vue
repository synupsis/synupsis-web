<template>
  <AuthPageShell :title="t('Check Your Inbox')" :alternate-label="t('Log in')" alternate-to="/login">
    <div class="space-y-3 text-center">
      <p>{{ t('We have sent a confirmation link to {email}.', { email }) }}</p>
      <p class="text-sm text-muted-foreground">{{ t('Please click the link in the email to activate your account.') }}</p>
    </div>
    <div class="mt-8 space-y-3">
      <Button as-child class="h-12 w-full rounded-lg bg-foreground text-sm font-semibold text-background hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <NuxtLink to="/">{{ t('Back to Homepage') }}</NuxtLink>
      </Button>
      <Button type="button" variant="outline" :disabled="isResending" class="h-12 w-full rounded-lg border border-border bg-background/70 text-sm font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background" @click="resendConfirmation">
        <LoaderCircle v-if="isResending" class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {{ t('Didn\'t receive an email? Resend') }}
      </Button>
    </div>
  </AuthPageShell>
</template>

<script lang="ts" setup>
const { t } = useI18n();
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { toast } from 'vue-sonner';
import { Button } from '~/components/shadcn/button';
import AuthPageShell from '~/components/AuthPageShell.vue';
import { LoaderCircle } from 'lucide-vue-next';

const route = useRoute();
const supabase = useSupabaseClient();

const email = computed(() => route.query.email as string);
const isResending = ref(false);

const resendConfirmation = async () => {
  if (!email.value) return;
  isResending.value = true;
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.value,
    });
    if (error) {
      toast.error(t('Error'), { description: t(error.message) });
    } else {
      toast.success(t('Confirmation email resent successfully!'));
    }
  } catch (e: any) {
    toast.error(t('An unexpected error occurred'), { description: t('Please try again.') });
  } finally {
    isResending.value = false;
  }
};
</script>
