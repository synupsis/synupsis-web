<template>
  <div class="flex items-center justify-center min-h-screen bg-gray-900 text-white">
    <div class="max-w-md w-full p-8 space-y-8">
      <div class="text-center">
        <h2 class="text-3xl font-extrabold">Check your inbox</h2>
        <p class="mt-2 text-sm text-gray-400">We've sent you a confirmation email. Please check your spam folder if you can't find it.</p>
      </div>
      <router-link to="/" class="block w-full">
        <Button class="w-full">Back to Homepage</Button>
      </router-link>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { toast } from 'vue-sonner'
import { onMounted } from 'vue'

const route = useRoute()

onMounted(() => {
  if (route.query.email) {
    toast.info('Confirmation Email Sent', {
      description: `We've sent a confirmation email to ${route.query.email}. Please click the link in the email to confirm your account.`,
      duration: 10000,
    })
  } else {
    toast.info('Confirmation email sent. Please check your inbox.')
  }
})
</script>
