<template>
  <div class="flex flex-col min-h-screen">
    <NuxtRouteAnnouncer />
    <NuxtLoadingIndicator />
    <NuxtPage class="flex-grow" />
    <Footer v-if="showFooter" :compact="compactFooter" />
    <ClientOnly>
      <RecapStoryOverlay />
    </ClientOnly>
    <Toaster position="top-center" />
  </div>
</template>

<script lang="ts" setup>
import { Toaster } from '~/components/shadcn/sonner'
import 'vue-sonner/style.css'
import Footer from '~/components/Footer.vue'
import RecapStoryOverlay from '~/components/RecapStoryOverlay.vue'
import { getBrowserLocale } from '~/lib/i18n/locale'

const { locale, browserLocale } = useI18n();
const updateBrowserLocale = () => {
  browserLocale.value = getBrowserLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
};
onMounted(() => {
  updateBrowserLocale();
  window.addEventListener('languagechange', updateBrowserLocale);
});
onUnmounted(() => window.removeEventListener('languagechange', updateBrowserLocale));

const route = useRoute();
const showFooter = computed(() => !route.path.startsWith('/recap'));
const compactFooter = computed(() => ['login', 'signup', 'pwdforgot', 'password-reset', 'email-confirmation'].includes(String(route.name)));

useHead(() => ({
  link: [
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Inter:wght@400;500;600;700&display=swap'
    }
  ],
  htmlAttrs: {
    lang: locale.value,
    'data-theme': 'night',
    class: 'dark'
  }
}));
provideHeadlessUseId(() => useId());
</script>
