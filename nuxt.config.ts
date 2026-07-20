// https://nuxt.com/docs/api/configuration/nuxt-config
const supabaseUrl =
  process.env.NUXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL
const supabasePublishableKey =
  process.env.NUXT_PUBLIC_SUPABASE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY

export default defineNuxtConfig({
  runtimeConfig: {
    supabase: {
      // Keep secrets out of the build artifact. Nitro resolves
      // NUXT_SUPABASE_SECRET_KEY from the runtime environment instead.
      secretKey: ''
    }
  },
  pages: true,
  routeRules: {
    '/api/image-proxy/**': {
      proxy: {
        to: `${supabaseUrl}/functions/v1/image-proxy/**`,
        headers: supabasePublishableKey
          ? { apikey: supabasePublishableKey }
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
    url: supabaseUrl,
    key: supabasePublishableKey,
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
