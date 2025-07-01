<template>
  <div class="relative flex min-h-screen flex-col justify-center overflow-hidden py-6 sm:py-12">
    <div class="flex flex-col items-center justify-center gap-4">
      <router-link to="/">
        <Logo class="h-36 w-36" />
      </router-link>
      <Alert v-if="error" variant="destructive">
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>
          {{ error }}
        </AlertDescription>
      </Alert>
    </div>

    <div
      class="relative bg-white px-6 pt-10 pb-8 shadow-xl text-gray-900 ring-1 ring-gray-900/5 sm:mx-auto sm:max-w-lg sm:rounded-lg sm:px-10 m-8"
    >
      <div class="text-center mb-10">
        <div class="text-black text-2xl font-black inline-block">Signup</div>
      </div>

      <div class="mb-2">
        <div class="text-black font-semibold">Username</div>
        <label class="relative block">
          <span class="sr-only">Username input</span>
          <Input v-model="username" name="username" placeholder="Enter your username" type="text" />
        </label>
      </div>

      <div class="mb-2">
        <div class="text-black font-semibold">Email</div>
        <label class="relative block">
          <span class="sr-only">E-mail input</span>
          <Input v-model="email" name="email" placeholder="Enter your email" type="email" />
        </label>
      </div>

      <div class="mb-2">
        <div class="text-black font-semibold">Password</div>
        <label class="relative block">
          <span class="sr-only">Password input</span>
          <Input
            v-model="password"
            name="password"
            placeholder="Enter your password"
            type="password"
          />
        </label>
      </div>

      <div class="flex grow justify-around gap-1 mb-4">
        <div class="pl-2">
          <div class="border border-slate-300 bg-slate-200 h-1 w-16 rounded-lg"></div>
        </div>
        <div class="grow border border-slate-300 bg-slate-200 h-1 w-16 rounded-lg"></div>
        <div class="grow border border-slate-300 bg-slate-200 h-1 w-16 rounded-lg"></div>
        <div class="grow border border-slate-300 bg-slate-200 h-1 w-16 rounded-lg"></div>
        <div class="grow border border-slate-300 bg-slate-200 h-1 w-16 rounded-lg"></div>
      </div>

      <div class="flex gap-2 justify-center mb-1">
        <Button :disabled="!email.length || password.length < 6" @click="register()">
          Register</Button
        >
      </div>
      <div class="flex justify-center gap-1">
        <p class="text-black text-sm">Already registered ?</p>
        <div class="text-black text-sm underline underline-offset-1">
          <router-link to="/login">Login</router-link>
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
