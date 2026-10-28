<template>
  <div class="w-full h-screen flex flex-col items-center justify-center p-4 bg-background">
    <div class="w-full max-w-md">
      <div class="flex justify-center mb-8">
        <Logo display-text size="md" :aria-label="t('Synupsis home')" />
      </div>
      <Card>
        <CardHeader class="text-center">
          <CardTitle>{{ t('Check Your Inbox') }}</CardTitle>
        </CardHeader>
        <CardContent class="text-center space-y-4">
          <MailCheckIcon class="h-16 w-16 text-primary mx-auto" />
          <p>{{ t('We have sent a confirmation link to {email}.', { email }) }}</p>
          <p class="text-sm text-muted-foreground">{{ t('Please click the link in the email to activate your account.') }}</p>
        </CardContent>
        <CardFooter class="flex flex-col gap-4">
          <Button class="w-full" as-child>
            <router-link to="/">{{ t('Back to Homepage') }}</router-link>
          </Button>
          <Button variant="outline" class="w-full" @click="resendConfirmation" :disabled="isResending">
            <SpinLoader v-if="isResending" class="h-4 w-4 mr-2" />
            {{ t('Didn\'t receive an email? Resend') }}
          </Button>
        </CardFooter>
      </Card>
    </div>
  </div>
</template>

<script lang="ts" setup>
const { t } = useI18n();
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { toast } from 'vue-sonner';
import { Button } from '~/components/shadcn/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/shadcn/card';
import { MailCheckIcon } from 'lucide-vue-next';
import SpinLoader from '~/components/ui/SpinLoader.vue';

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
