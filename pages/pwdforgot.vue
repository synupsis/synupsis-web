<template>
  <div class="w-screen h-screen bg-blue-900 text-red-100">
    <div class="flex flex-row">
      <div class="hidden lg:flex w-[1080px] h-screen">
        <video class="h-screen max-w-[1080px] responsive-video" autoplay loop muted>
          <source src="~/assets/mp4/forgot.mp4" type="video/webm" />
        </video>
      </div>
      <div class="flex flex-col w-1/2 h-screen place-content-center ml-24">
        <div class="text-3xl font-bold w-3/6 mb-8">Forgot password ?</div>
        <div class="w-3/6 mb-8">
          <div class="mb-4">
            Enter the email address you used when you joined and we’ll send you instructions to
            reset your password.
          </div>
          <div>
            For security reasons, we do NOT store your password. So rest assured that we will never
            send your password via email.
          </div>
        </div>
        <div class="w-3/6 mb-2">Email Address</div>
        <Input v-model="email" class="w-3/6 mb-4" type="email" />
        <Button class="text-sm font-semibold" @click="sendResetInstructions"
          >Send Reset Instructions</Button
        >
      </div>
    </div>
  </div>

  <!-- TODO: Display logo + video credits -->
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import useSupabase from '~/composables/useSupabase';
import { toast } from 'vue-sonner'

const supabase = useSupabase();
const email = ref('');

const sendResetInstructions = async () => {
  const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.value, {
    redirectTo: `${window.location.origin}/password-reset`
  });

  if (resetError) {
    toast.error('Error', {
      description: resetError.message
    })
  } else {
    toast.success('Success', {
      description: 'Password reset instructions sent to your email.'
    })
  }
};
</script>
