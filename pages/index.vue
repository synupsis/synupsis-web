<template>
  <div>
    <div class="w-full flex flex-col items-center gap-4 sm:justify-center">
      <div
        class="relative flex w-full h-[600px] flex-col items-center justify-center overflow-hidden rounded-lg lg:w-full md:w-full"
      >
        <div class="absolute top-5 right-5 text-right w-full z-20">
          <template v-if="user === undefined">
            <SpinLoader class="h-5 w-5" />
          </template>
          <template v-else-if="user === null">
            <div class="flex gap-4 items-center justify-end">
              <Button variant="ghost" @click="goToLogin">Log in</Button>
              <Button @click="goToSignup">Sign up</Button>
            </div>
          </template>
          <template v-else>
            <div class="flex gap-4 items-center justify-end">
              <p>{{ user.email }}</p>
              <Button variant="ghost" @click="logout">Log out</Button>
            </div>
          </template>
        </div>
        <Logo class="z-10 h-56 w-56" />
        <div class="absolute w-full p-2 flex flex-col items-center mt-[400px]">
          <img alt="Synupsis" class="w-80" src="~/assets/svg/logo_text.svg" />
          <div class="h-6">
            <p class="italic text-pretty">{{ randomTagline }}</p>
          </div>
          <VanishingInput
            v-model="searchInput"
            :loading="isLoading"
            :placeholders="placeholders"
            class="mt-8"
          />
        </div>
        <Ripple
          circle-class="border-[hsl(var(--primary))] bg-[#0000]/25 dark:bg-[#fff]/25 rounded-[50px]"
          class="bg-white/5 [mask-image:linear-gradient(to_bottom,white,transparent)]"
        />
      </div>
      <div class="w-full max-w-xl text-left">
        <ClientOnly>
          <BlurReveal
            v-if="searchResults.length"
            :delay="0.2"
            :duration="0.75"
            class="px-4 flex flex-col gap-4 mt-2"
          >
            <div
              v-for="show in searchResults"
              :key="show.id"
              class="flex items-center gap-4 py-1 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
              @click="goToShow(show)"
            >
              <p class="text-pretty text-lg">
                <span class="font-bold">{{ show.name }}</span> {{ show.secondary }}
              </p>
              <div class="bg-white/10 rounded-full">
                <ChevronRightIcon class="w-5 h-5 m-1" />
              </div>
            </div>
          </BlurReveal>
        </ClientOnly>
      </div>
      <div v-if="searchError" class="flex h-[500px] flex-col gap-4 lg:h-[250px] lg:flex-row">
        <CardSpotlight
          class="flex-col items-center justify-center whitespace-nowrap shadow-2xl px-14"
          gradient-color="#363636"
        >
          <p class="text-4xl text-red-400">Oops. There was an error.</p>
          <p>{{ searchError }}</p>
        </CardSpotlight>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { ChevronRightIcon } from '@heroicons/vue/16/solid';
import { useDebounceFn } from '@vueuse/core';
import type { Show } from '~/types/database.types';
import Ripple from '~/components/ui/Ripple.vue';
import VanishingInput from '~/components/ui/VanishingInput.vue';
import CardSpotlight from '~/components/ui/CardSpotlight.vue';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import BlurReveal from '~/components/ui/BlurReveal.vue';
import Logo from '~/components/Logo.vue';

interface SearchResult {
  id: number;
  name: string;
  secondary: string;
}

const { slugify } = useUtils();
const user = useSupabaseUser();
const router = useRouter();
const supabase = useSupabase();

const searchInput = ref('');
const searchResults = ref<SearchResult[]>([]);
const searchError = ref<string | null>(null);

const placeholders = ['Breaking Bad', 'Lost', 'How I Met Your Mother', 'Friends', 'Severance'];
const randomTagline = useState('random-tagline', () => {
  const taglines = [
    "Short memory, but don't worry.",
    'Quick Summaries for Every Show.',
    'Never Forget What Happened.',
    'Binge the Summary, Savor the Show.',
    'Your Series, Briefly.',
    'All Shows, Short and Sweet.',
    'Every Series Summarized.',
    'Your Shortcut to Storylines.',
    'Summing Up Stories'
  ];
  return taglines[Math.floor(Math.random() * taglines.length)];
});

const isLoading = ref(false)

const { execute: executeSearch } = useLazyFetch(() => `/api/shows/search`, {
  query: { q: searchInput },
  immediate: false,
  watch: false, // We will trigger this manually
  onResponse({ response }) {
    if (response.ok) {
      searchResults.value = response._data.shows.map((show: Show) => ({
        id: show.id,
        name: show.name,
        secondary: `${new Date(show.premiered).getFullYear()} - ${
          show.ended ? new Date(show.ended).getFullYear() : 'Present'
        }`
      }));
      searchError.value = null;
    }
    isLoading.value = false
  },
  onResponseError({ response }) {
    console.error('Error searching shows:', response._data?.message || 'Unknown error');
    searchError.value = 'Failed to search for shows.';
    searchResults.value = [];
    isLoading.value = false
  }
});

const debouncedSearch = useDebounceFn(() => {
  if (searchInput.value.length > 2) {
    isLoading.value = true
    executeSearch();
  } else {
    searchResults.value = [];
  }
}, 300);

watch(searchInput, debouncedSearch);

function goToShow(show: SearchResult) {
  const slug = slugify(show.name);
  router.push(`/shows/${slug}-${show.id}`);
}

function goToLogin() {
  router.push('/login');
}

function goToSignup() {
  router.push('/signup');
}

async function logout() {
  await supabase.auth.signOut();
  navigateTo('/');
}
</script>