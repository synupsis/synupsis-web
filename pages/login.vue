<template>
  <div
    class="text-black bg-blue-900 relative flex min-h-screen flex-col justify-center overflow-hidden bg-green-500 py-6 sm:py-12"
  >
    <div
      class="relative bg-white px-6 pt-10 pb-8 shadow-xl ring-1 ring-gray-900/5 sm:mx-auto sm:max-w-lg sm:rounded-lg sm:px-10 m-8"
    >
      <div class="flex justify-between gap-4 items-center mb-10">
        <router-link to="/">
          <Logo class="h-16 w-16" />
        </router-link>
        <div class="text-black text-2xl font-black inline-block">Welcome back !</div>
      </div>

      <div class="mb-6">
        <div class="text-black font-semibold">Email</div>
        <label class="relative block">
          <span class="sr-only">Mail input</span>
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

      <div class="flex gap-10 text-sm mb-8 justify-between">
        <div class="flex justify gap-1 ml-2 items-center">
          <Checkbox name="remember-me" />
          <div class="text-black">Remember me</div>
        </div>
        <div class="text-black underline underline-offset-1">
          <a href="http://localhost:3000/pwdforgot">Forgot password ?</a>
          <!-- remplacer par le lien définitif-->
        </div>
      </div>

      <div class="flex justify-center mb-1">
        <Button @click="login">Login</Button>
      </div>

      <div class="flex justify-center gap-1">
        <p class="text-black text-sm">No account yet ?</p>
        <div class="text-black text-sm underline underline-offset-1">
          <Button type="link" to="/signup">Register</Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import Input from '~/components/ui/Input.vue';
import Checkbox from '~/components/ui/Checkbox.vue';
import Button from '~/components/ui/Button.vue';
import useSupabase from '~/composables/useSupabase';

const { supabase } = useSupabase();

const email = ref('');
const password = ref('');

const login = async () => {
  let { data, error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value
  });
  navigateTo('/');
};
</script>
