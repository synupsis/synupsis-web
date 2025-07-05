<template>
  <div>
    <div class="w-full flex flex-col items-center gap-4 sm:justify-center">
      <div
        class="relative flex w-full h-[600px] flex-col items-center justify-center overflow-hidden rounded-lg lg:w-full md:w-full"
      >
        <div class="absolute top-5 right-5 text-right w-full z-20">
          <UserAuthStatus />
        </div>
        <Logo class="z-10 h-56 w-56" />
        <div class="absolute w-full p-2 flex flex-col items-center mt-[400px]">
          <img alt="Synupsis" class="w-80" src="/svg/logo_text.svg" />
          <div class="h-6">
            <p class="italic text-pretty">{{ randomTagline }}</p>
          </div>
          <VanishingInput
            v-model="searchInput"
            :loading="isLoading"
            :placeholders="placeholders"
            class="mt-8"
            @submit="handleSearchSubmit"
          />
        </div>
        <Ripple
          circle-class="border-[hsl(var(--primary))] bg-[#0000]/25 dark:bg-[#fff]/25 rounded-[50px]"
          class="bg-white/5 [mask-image:linear-gradient(to_bottom,white,transparent)]"
        />
      </div>
      <div v-if="searchResults.length" class="w-full text-left px-12">
        <ClientOnly>
          <Carousel
            class="w-full"
            :opts="{
              align: 'start',
              dragFree: true
            }"
          >
            <CarouselContent class="-ml-4">
              <CarouselItem
                v-for="(show, index) in searchResults"
                :key="show.id"
                class="pl-4 basis-1/3 sm:basis-1/4 md:basis-1/5 lg:basis-1/6"
              >
                <BlurReveal :delay="0.1 * index" :duration="0.5">
                  <div
                    class="flex h-full flex-col items-center gap-2 py-1 opacity-70 transition-opacity hover:opacity-100 cursor-pointer"
                    @click="goToShow(show)"
                  >
                    <div class="relative w-full rounded-lg overflow-hidden aspect-[2/3]">
                      <img
                        v-if="show.image"
                        :src="show.image"
                        :alt="show.name"
                        class="w-full h-full object-cover"
                      />
                      <div
                        v-else
                        class="w-full h-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center"
                      >
                        <PhotoIcon class="w-8 h-8 text-gray-400" />
                      </div>
                    </div>
                    <p class="text-pretty text-sm sm:text-base text-center font-bold">
                      {{ show.name }}
                    </p>
                    <p class="text-xs sm:text-sm text-gray-400">{{ show.secondary }}</p>
                  </div>
                </BlurReveal>
              </CarouselItem>
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
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
import BlurReveal from '~/components/ui/BlurReveal.vue';
import Logo from '~/components/Logo.vue';
import UserAuthStatus from '~/components/UserAuthStatus.vue';
import { PhotoIcon } from '@heroicons/vue/16/solid';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '~/components/shadcn/carousel';

interface SearchResult {
  id: number;
  name: string;
  secondary: string;
  image: string | null;
}

const { slugify } = useUtils();
const router = useRouter();

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
        image: show.image,
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

function handleSearchSubmit() {
  if (searchResults.value.length > 0) {
    goToShow(searchResults.value[0]);
  }
}
</script>