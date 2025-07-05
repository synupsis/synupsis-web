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

            <div class="relative my-4">
              <div class="absolute inset-0 flex items-center">
                <span class="w-full border-t" />
              </div>
              <div class="relative flex justify-center text-xs uppercase">
                <span class="bg-background px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>

            <Button variant="outline" class="w-full" @click="loginWithGoogle">
              <svg class="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 381.5 512 244 512 109.8 512 0 402.2 0 261.8S109.8 11.8 244 11.8c70.3 0 129.8 27.8 174.3 71.9l-64.4 64.4c-23.5-22.3-56.8-36.8-99.9-36.8-83.2 0-151.3 67.8-151.3 151.3s68.1 151.3 151.3 151.3c97.3 0 131.3-71.5 135-112.2H244v-77.2h244z"></path></svg>
              Google
            </Button>
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
  let { data, error: loginError } = await supabase.auth.signInWithPassword({
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

const loginWithGoogle = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
  });
  if (error) {
    toast.error('Error', {
      description: error.message
    });
  }
};
</script>
