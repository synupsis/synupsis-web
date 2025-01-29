// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  pages: true,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],

  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {}
    }
  },

  runtimeConfig: {
    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    }
  },

  typescript: {
    typeCheck: false
  },

  supabase: {
    redirect: false
  },

  compatibilityDate: '2024-08-15',
  modules: ['@nuxtjs/supabase', 'nuxt-headlessui']
});
