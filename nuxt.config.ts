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
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      meta: [
        { name: 'theme-color', content: '#0a0a0a' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'Synupsis' },
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'apple-touch-icon', href: '/pwa/apple-touch-icon.png', sizes: '180x180' },
      ],
    },
  },

  pwa: {
    registerType: 'prompt',
    manifest: {
      id: '/',
      name: 'Synupsis',
      short_name: 'Synupsis',
      description: 'Find your show. Refresh your memory.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#0a0a0a',
      background_color: '#0a0a0a',
      icons: [
        { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    client: {
      installPrompt: true,
      periodicSyncForUpdates: 60 * 60,
    },
    workbox: {
      cacheId: 'synupsis',
      cleanupOutdatedCaches: true,
      // Server-rendered pages contain session-specific data. Only static build
      // assets are precached; API, auth, payloads and external media stay online.
      // Read public files from the final Nitro output: Nuxt disables Vite's
      // publicDir, so the plugin's includeAssets cannot discover these files.
      globPatterns: ['_nuxt/**/*.{js,css,woff,woff2,svg,png,webp,ico}', 'pwa/*.png', 'offline.html', 'favicon.ico'],
      // Immutable Nuxt build metadata is safe; its moving latest pointer must
      // reach the server so Nuxt can still detect subsequent deployments.
      globIgnores: ['**/_payload.json', '**/builds/latest.json'],
      // Nuxt's default transform rewrites .html URLs as page routes. The offline
      // document is a public file, so preserve its exact URL in the precache.
      manifestTransforms: [async entries => ({ manifest: entries, warnings: [] })],
      navigateFallback: null,
      runtimeCaching: [{
        urlPattern: ({ request, url }) => request.mode === 'navigate'
          && url.origin === self.location.origin
          && url.pathname !== '/api'
          && !url.pathname.startsWith('/api/')
          && !url.pathname.startsWith('/_nuxt/'),
        handler: 'NetworkOnly',
        options: { precacheFallback: { fallbackURL: '/offline.html' } },
      }],
    },
  },

  routeRules: {
    '/sw.js': { headers: { 'cache-control': 'no-cache' } },
    '/manifest.webmanifest': { headers: { 'cache-control': 'no-cache' } },
  },

  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {}
    }
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
    'shadcn-nuxt',
    '@nuxtjs/color-mode',
    '@vite-pwa/nuxt'
  ],
  shadcn: {
    prefix: '',
    componentDir: './components/shadcn'
  }
});
