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

  typescript: {
    typeCheck: false
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    redirect: true,
    redirectOptions: {
      login: '/login',
      callback: '/email-confirmation',
      exclude: ['/', '/signup', '/pwdforgot', '/email-confirmation', '/shows/*', '/recap/*'],
    },
  },

  compatibilityDate: '2024-08-15',
  modules: [
    '@nuxtjs/supabase',
    'nuxt-headlessui',
    'shadcn-nuxt'
  ],
  shadcn: {
    /**
     * Prefix for all the imported component
     */
    prefix: '',
    /**
     * Directory that the component lives in.
     * @default "./components/ui"
     */
    componentDir: './components/shadcn'
  }
});