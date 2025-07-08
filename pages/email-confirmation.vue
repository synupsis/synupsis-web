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
          <CardTitle>Check Your Inbox</CardTitle>
        </CardHeader>
        <CardContent class="text-center space-y-4">
          <MailCheckIcon class="h-16 w-16 text-primary mx-auto" />
          <p>We've sent a confirmation link to <span class="font-bold">{{ email }}</span>.</p>
          <p class="text-sm text-muted-foreground">Please click the link in the email to activate your account.</p>
        </CardContent>
        <CardFooter class="flex flex-col gap-4">
          <Button class="w-full" as-child>
            <router-link to="/">Back to Homepage</router-link>
          </Button>
          <Button variant="outline" class="w-full" @click="resendConfirmation" :disabled="isResending">
            <SpinLoader v-if="isResending" class="h-4 w-4 mr-2" />
            Didn't receive an email? Resend
          </Button>
        </CardFooter>
      </Card>
    </div>
  </div>
</template>

<script lang="ts" setup>
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
      toast.error('Error', { description: error.message });
    } else {
      toast.success('Confirmation email resent successfully!');
    }
  } catch (e: any) {
    toast.error('An unexpected error occurred', { description: e.message });
  } finally {
    isResending.value = false;
  }
};
</script>
