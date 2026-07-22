<template>
  <div class="w-full min-h-screen flex flex-col">
    <!-- Background -->
    <div class="absolute inset-0 z-0 opacity-20">
      <CachedImage v-if="featuredShow" :src="featuredShow.image.replace('thumb', 'full')" class="w-full h-full object-cover" alt="Featured show background" />
      <div class="absolute inset-0 bg-gradient-to-t from-background via-background to-transparent" />
    </div>

    <!-- Header -->
    <header class="relative z-10 flex w-full justify-between items-center py-6 px-8">
      <Logo display-text />
      <UserAuthStatus />
    </header>

    <!-- Main Content -->
    <main class="relative z-10 flex flex-1 flex-col items-center justify-center text-center p-4">
      <h1 class="text-5xl md:text-7xl font-extrabold tracking-tighter">Never lose track again.</h1>
      <p class="mt-4 max-w-2xl text-lg text-muted-foreground">
        All the recaps for your favorite shows, right at your fingertips.
      </p>

      <!-- Search Bar -->
      <div class="relative w-full max-w-xl mt-12">
        <VanishingInput
          v-model="searchQuery"
          :placeholders="['Breaking Bad', 'Game of Thrones', 'Stranger Things', 'Squid Game', 'The Office', 'The Witcher', 'The Mandalorian', 'The Boys', 'The Crown', 'The Queen\'s Gambit']"
          :loading="isSearching"
          class="w-full h-14 text-lg"
        />
      </div>
    </main>

    <!-- Results/Featured Section -->
    <section class="relative z-10 w-full py-16">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        <Transition name="fade" mode="out-in">
          <!-- Search Results -->
          <div v-if="searchQuery.length > 1" class="animate-fade-in">
            <h2 class="text-3xl font-bold tracking-tight text-white sm:text-4xl mb-10">Search Results</h2>
            <div v-if="isSearching" class="flex justify-center">
              <SpinLoader class="h-12 w-12" />
            </div>
            <Carousel v-else-if="searchResults.length > 0" class="w-full">
              <CarouselContent class="-ml-4">
                <CarouselItem v-for="show in searchResults" :key="show.traktId" class="pl-4 basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5">
                  <BlurReveal>
                    <router-link :to="`/shows/${show.slug}-${show.traktId}`" class="group">
                      <div class="aspect-[2/3] w-full overflow-hidden rounded-lg">
                        <CachedImage :src="show.image" :alt="show.name" class="w-full h-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-105" />
                      </div>
                    </router-link>
                  </BlurReveal>
                </CarouselItem>
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
            <p v-else class="text-muted-foreground text-center">No results found for "{{ searchQuery }}".</p>
          </div>

          <!-- Featured Shows -->
          <div v-else class="animate-fade-in">
            <h2 class="text-3xl font-bold tracking-tight text-white sm:text-4xl mb-10">Trending Now</h2>
            <Carousel v-if="featuredShows" class="w-full">
               <CarouselContent class="-ml-4">
                <CarouselItem v-for="show in featuredShows" :key="show.traktId" class="pl-4 basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5 ">
                  <BlurReveal>
                    <router-link :to="`/shows/${show.slug}-${show.traktId}`" class="group">
                      <div class="aspect-[2/3] w-full overflow-hidden rounded-lg">
                        <CachedImage :src="show.image" :alt="show.name" class="w-full h-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-105" />
                      </div>
                    </router-link>
                  </BlurReveal>
                </CarouselItem>
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
            <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              <div v-for="i in 5" :key="i" class="aspect-[2/3] w-full bg-muted rounded-lg animate-pulse" />
            </div>
          </div>
        </Transition>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import VanishingInput from '~/components/ui/VanishingInput.vue';
import UserAuthStatus from '~/components/UserAuthStatus.vue';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import BlurReveal from '~/components/ui/BlurReveal.vue';
import Logo from '~/components/Logo.vue';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '~/components/shadcn/carousel';
import type { TraktShowCard } from '~/types/trakt.types';
import CachedImage from '~/components/CachedImage.vue';

const searchQuery = ref('');
const searchResults = ref<TraktShowCard[]>([]);
const isSearching = ref(false);

const { data: featuredShows } = useFetch<TraktShowCard[]>('/api/shows/trending');
const featuredShow = computed(() => featuredShows.value?.[0] ?? null);

const searchShows = useDebounceFn(async () => {
  if (searchQuery.value.length < 2) {
    searchResults.value = [];
    return;
  }
  isSearching.value = true;
  try {
    const results = await $fetch<TraktShowCard[]>(`/api/shows/search?q=${searchQuery.value}`);
    searchResults.value = results;
  } catch (error) {
    console.error('Search error:', error);
    searchResults.value = [];
  } finally {
    isSearching.value = false;
  }
}, 300);

watch(searchQuery, searchShows);
</script>
