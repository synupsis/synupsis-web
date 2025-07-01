<template>
  <div class="flex items-center justify-center min-h-screen bg-gray-900 text-white">
    <div class="max-w-md w-full p-8 space-y-8">
      <div class="text-center">
        <h2 class="text-3xl font-extrabold">Check your inbox</h2>
      </div>
      <Alert>
        <AlertTitle>Confirmation Email Sent</AlertTitle>
        <AlertDescription>
          We've sent a confirmation email to
          <span class="font-semibold">{{ $route.query.email }}</span
          >. Please click the link in the email to confirm your account.
        </AlertDescription>
      </Alert>
      <router-link to="/" class="block w-full">
        <Button class="w-full">Back to Homepage</Button>
      </router-link>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import Button from '~/components/ui/Button.vue';
</script>
