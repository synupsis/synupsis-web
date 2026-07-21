<template>
  <div class="w-full h-screen bg-background text-white">
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

            <Button :disabled="!email || !password || isLoading" class="w-full" type="submit">
              <span v-if="isLoading" class="loading loading-spinner h-4 w-4" />
              <span v-else>Login</span>
            </Button>

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
import Checkbox from '~/components/ui/Checkbox.vue';
import { toast } from 'vue-sonner'

const supabase = useSupabaseClient();

const email = ref('');
const password = ref('');
const isLoading = ref(false);


const login = async () => {
  isLoading.value = true;
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value
  });
  if (loginError) {
    toast.error('Error', {
      description: loginError.message
    })
    isLoading.value = false;
    return;
  }
  navigateTo('/');
};
</script>
