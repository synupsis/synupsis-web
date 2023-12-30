<template>
  <div
    class="relative flex min-h-screen flex-col justify-center overflow-hidden bg-blue-900 py-6 sm:py-12"
  >
    <div
      class="relative bg-white px-6 pt-10 pb-8 shadow-xl ring-1 ring-gray-900/5 sm:mx-auto sm:max-w-lg sm:rounded-lg sm:px-10 m-8"
    >
      <div class="flex justify-between gap-4 items-center mb-10">
        <router-link to="/">
          <Logo class="h-16 w-16" />
        </router-link>
        <div class="text-black text-2xl font-black inline-block">Signup</div>
      </div>

      <div class="mb-6">
        <div class="text-black font-semibold">Username</div>
        <label class="relative block">
          <span class="sr-only">Username input</span>
          <input
            class="placeholder:italic placeholder:text-slate-400 text-black block bg-white w-full border border-slate-300 rounded-md py-2 pr-3 shadow-sm focus:outline-none focus:border-sky-500 focus:ring-sky-500 focus:ring-1 sm:text-xs"
            placeholder="Enter your username"
            type="text"
            name="username"
          />
        </label>
      </div>

      <div class="mb-2">
        <div class="text-black font-semibold">Email</div>
        <label class="relative block">
          <span class="sr-only">E-mail input</span>
          <Input v-model="email" placeholder="Enter your email" type="email" name="email" />
        </label>
      </div>

      <div class="mb-2">
        <div class="text-black font-semibold">Password</div>
        <label class="relative block">
          <span class="sr-only">Password input</span>
          <Input
            v-model="password"
            placeholder="Enter your password"
            type="password"
            name="password"
          />
        </label>
      </div>

      <div class="flex grow justify-around gap-1">
        <div class="pl-2">
          <div class="border border-slate-300 bg-slate-200 h-1 w-16 rounded-lg"></div>
        </div>
        <div class="grow border border-slate-300 bg-slate-200 h-1 w-16 rounded-lg"></div>
        <div class="grow border border-slate-300 bg-slate-200 h-1 w-16 rounded-lg"></div>
        <div class="grow border border-slate-300 bg-slate-200 h-1 w-16 rounded-lg"></div>
        <div class="grow border border-slate-300 bg-slate-200 h-1 w-16 rounded-lg"></div>
        >
      </div>

      <div class="flex justify-center mb-1">
        <Button :disabled="!email || !password" @click="register()"> Register </Button>
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

const { supabase } = useSupabase();

const email = ref('');
const password = ref('');

const register = async () => {
  let { data, error } = await supabase.auth.signUp({
    email: email.value,
    password: password.value
  });
  navigateTo('/email-confirmation');
};
</script>
