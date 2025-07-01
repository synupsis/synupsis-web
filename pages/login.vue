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
          <h2 class="text-3xl font-bold text-center mb-6">Welcome back!</h2>

          <Alert v-if="error" variant="destructive" class="mb-4">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {{ error }}
            </AlertDescription>
          </Alert>

          <form class="space-y-6" @submit.prevent="login">
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

            <div class="flex items-center justify-between text-sm">
              <div class="flex items-center gap-2">
                <Checkbox id="remember-me" name="remember-me" />
                <label for="remember-me">Remember me</label>
              </div>
              <router-link class="underline" to="/pwdforgot">Forgot password?</router-link>
            </div>

            <Button :disabled="!email || !password" class="w-full" type="submit">Login</Button>

            <p class="text-center text-sm">
              No account yet?
              <router-link class="underline" to="/signup">Register</router-link>
            </p>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import Input from '~/components/ui/Input.vue';
import Checkbox from '~/components/ui/Checkbox.vue';
import Button from '~/components/ui/Button.vue';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import useSupabase from '~/composables/useSupabase';

const supabase = useSupabase();

const email = ref('');
const password = ref('');
const error = ref('');


const login = async () => {
  error.value = '';
  let { data, error: loginError } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value
  });
  if (loginError) {
    error.value = loginError.message;
    return;
  }
  navigateTo('/');
};
</script>
