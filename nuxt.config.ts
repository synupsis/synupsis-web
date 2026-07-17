// https://nuxt.com/docs/api/configuration/nuxt-config
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY

export default defineNuxtConfig({
  pages: true,
  routeRules: {
    '/api/image-proxy/**': {
      proxy: {
        to: `${process.env.SUPABASE_URL}/functions/v1/image-proxy/**`,
        headers: supabaseAnonKey
          ? { Authorization: `Bearer ${supabaseAnonKey}` }
          : undefined
      }
    }
  },
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
    serviceKey: supabaseServiceKey,
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
    'shadcn-nuxt',
    '@nuxtjs/color-mode'
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
