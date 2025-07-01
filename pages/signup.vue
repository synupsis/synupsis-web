<template>
  <div class="w-full h-screen bg-gray-900 text-white">
    <div class="flex h-full">
      <div class="hidden lg:flex w-1/2 h-full">
        <video class="h-full w-full object-cover" autoplay loop muted>
          <source src="~/assets/mp4/wednesday.mp4" type="video/mp4" />
        </video>
      </div>
      <div class="flex flex-col justify-center items-center w-full lg:w-1/2 p-8">
        <div class="max-w-md w-full">
          <div class="flex justify-center mb-8">
            <router-link to="/">
              <Logo class="h-24 w-24" />
            </router-link>
          </div>
          <h2 class="text-3xl font-bold text-center mb-6">Create an account</h2>

          <Alert v-if="error" variant="destructive" class="mb-4">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {{ error }}
            </AlertDescription>
          </Alert>

          <form class="space-y-6" @submit.prevent="register">
            <div>
              <label class="font-semibold" for="username">Username</label>
              <Input
                id="username"
                v-model="username"
                name="username"
                placeholder="Enter your username"
                type="text"
              />
            </div>
            <div>
              <label class="font-semibold" for="email">Email</label>
              <Input
                id="email"
                v-model="email"
                name="email"
                placeholder="Enter your email"
                type="email"
              />
            </div>
            <div>
              <label class="font-semibold" for="password">Password</label>
              <Input
                id="password"
                v-model="password"
                name="password"
                placeholder="Enter your password"
                type="password"
              />
            </div>

            <Button
              :disabled="!email || !password || !username"
              class="w-full"
              type="submit"
              >Register</Button
            >

            <p class="text-center text-sm">
              Already have an account?
              <router-link class="underline" to="/login">Login</router-link>
            </p>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import useSupabase from '~/composables/useSupabase';
import Button from '~/components/ui/Button.vue';
import Input from '~/components/ui/Input.vue';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';

const supabase = useSupabase();

const email = ref('');
const password = ref('');
const username = ref('');
const error = ref('');

const register = async () => {
  let { data, error: signUpError } = await supabase.auth.signUp({
    email: email.value,
    password: password.value,
    options: {
      data: { username: username.value }
    }
  });
  if (signUpError) {
    console.log(signUpError);
    error.value = signUpError.message;
    return;
  } else {
    navigateTo({
      path: '/email-confirmation',
      query: { email: data.user.email }
    });
  }
};
</script>
