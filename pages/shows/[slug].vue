<template>
  <div class="w-full">
    <!-- Header -->
    <header class="flex w-full justify-between items-center py-6 px-8">
      <router-link to="/">
        <img src="/svg/logo_text.svg" alt="Synupsis Logo" class="h-8" />
      </router-link>
      <UserAuthStatus />
    </header>

    <!-- Hero Section -->
    <div v-if="data"
      class="relative w-full h-[60vh] bg-cover bg-center bg-no-repeat"
      :style="{ backgroundImage: `url(${data.image ?? data.image?.original})` }"
    >
      <div class="absolute inset-0 bg-black/60 bg-gradient-to-t from-background to-transparent" />
      <div class="relative h-full flex flex-col justify-end items-start p-8 md:p-12 lg:p-16">
        <div class="max-w-3xl text-white">
          <div class="flex flex-wrap gap-2 mb-4">
            <Badge v-for="genre in data.genres" :key="genre" variant="secondary">{{ genre }}</Badge>
          </div>
          <h1 class="text-4xl md:text-6xl font-extrabold tracking-tighter text-balance">
            {{ data.name }}
          </h1>
          <div class="flex items-center flex-wrap gap-x-4 gap-y-2 mt-4 text-lg text-muted-foreground">
            <div v-if="data.rating?.average" class="flex items-center gap-1">
              <StarIcon class="h-5 w-5 text-yellow-400" />
              <span>{{ data.rating.average }} / 10</span>
            </div>
            <div v-if="data.status" class="flex items-center gap-1">
              <TvIcon class="h-5 w-5" />
              <span>{{ data.status }}</span>
            </div>
            <div v-if="data.premiered" class="flex items-center gap-1">
              <CalendarIcon class="h-5 w-5" />
              <span>{{ new Date(data.premiered).getFullYear() }}</span>
            </div>
          </div>
          <ClientOnly>
            <p class="mt-6 text-base md:text-lg line-clamp-3" v-html="data.summary" />
            <template #fallback>
              <div class="mt-6 space-y-2">
                <div class="h-4 w-full bg-muted-foreground/20 rounded-md animate-pulse" />
                <div class="h-4 w-full bg-muted-foreground/20 rounded-md animate-pulse" />
                <div class="h-4 w-5/6 bg-muted-foreground/20 rounded-md animate-pulse" />
              </div>
            </template>
          </ClientOnly>
        </div>
      </div>
    </div>
    <!-- Hero Skeleton -->
    <div v-else class="relative w-full h-[60vh] bg-muted animate-pulse">
       <div class="relative h-full flex flex-col justify-end items-start p-8 md:p-12 lg:p-16">
        <div class="max-w-3xl w-full">
          <div class="flex flex-wrap gap-2 mb-4">
            <div class="h-6 w-20 bg-muted-foreground/20 rounded-md" />
            <div class="h-6 w-24 bg-muted-foreground/20 rounded-md" />
          </div>
          <div class="h-16 w-3/4 bg-muted-foreground/20 rounded-md" />
          <div class="flex items-center flex-wrap gap-x-4 gap-y-2 mt-4">
            <div class="h-6 w-28 bg-muted-foreground/20 rounded-md" />
            <div class="h-6 w-24 bg-muted-foreground/20 rounded-md" />
            <div class="h-6 w-20 bg-muted-foreground/20 rounded-md" />
          </div>
          <div class="mt-6 space-y-2">
            <div class="h-4 w-full bg-muted-foreground/20 rounded-md" />
            <div class="h-4 w-full bg-muted-foreground/20 rounded-md" />
            <div class="h-4 w-5/6 bg-muted-foreground/20 rounded-md" />
          </div>
        </div>
      </div>
    </div>

    <!-- Seasons Section -->
    <div class="py-16">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 class="text-3xl font-bold tracking-tight text-white sm:text-4xl mb-10">Seasons</h2>
        <!-- Real Seasons -->
        <div v-if="data" class="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:gap-8">
          <SeasonCard
            v-for="season in data.seasons"
            :key="season.id"
            :season="season"
            :is-admin="isAdmin"
            :is-generating="generationState[season.id]?.pending ?? false"
            @view="goToRecap"
            @edit="goToRecapEditor(data.id, season.id)"
            @create="goToRecapEditor(data.id, season.id)"
            @generate="generateRecap(data.id, season.id)"
          />
        </div>
        <!-- Seasons Skeleton -->
        <div v-else class="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:gap-8 animate-pulse">
          <div v-for="i in 5" :key="i" class="flex flex-col bg-muted rounded-lg p-4 space-y-4">
            <div class="h-6 w-3/4 bg-muted-foreground/20 rounded-md" />
            <div class="h-4 w-1/2 bg-muted-foreground/20 rounded-md" />
            <div class="flex-grow" />
            <div class="h-10 w-full bg-muted-foreground/20 rounded-md" />
            <div class="h-10 w-full bg-muted-foreground/20 rounded-md" />
          </div>
        </div>
      </div>
    </div>

    <Recap v-model:is-open="isRecapOpen" />
  </div>
</template>
<script lang="ts" setup>
import { ref, watchEffect } from 'vue';
import type { TvMazeShow } from '~/types/tv-maze.types';
import { CalendarIcon, StarIcon, TvIcon } from '@heroicons/vue/24/outline';
import { toast } from 'vue-sonner';
import { Badge } from '~/components/shadcn/badge';
import UserAuthStatus from '~/components/UserAuthStatus.vue';
import ShowPageSkeleton from '~/components/ShowPageSkeleton.vue';
import SeasonCard from '~/components/SeasonCard.vue';

const user = useSupabaseUser();
const route = useRoute();
const supabase = useSupabaseClient();
const isAdmin = ref(false);

watchEffect(async () => {
  if (user.value) {
    const { data } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.value.id)
      .single();
    isAdmin.value = data?.role === 'admin';
  }
});

const { data, pending, refresh } = useAsyncData(
  `show-data-${route.params.slug}`,
  async () => {
    const tvMazeId = (route.params.slug as string).split('-').pop();
    if (!tvMazeId) {
      console.error('Invalid slug format');
      return null;
    }
    try {
      const response = await $fetch(`/api/shows/${tvMazeId}`);
      return response.show as TvMazeShow | null;
    } catch (e) {
      toast.error('Failed to fetch show data.');
      return null;
    }
  },
  { lazy: true }
);

const isRecapOpen = ref(false);
const generationState = ref<Record<string, { pending: boolean; error: string | null }>>({});

const generateRecap = async (showId: string, seasonId: string) => {
  generationState.value[seasonId] = { pending: true, error: null };
  try {
    await $fetch('/api/recap/generate', {
      method: 'POST',
      body: { showId, seasonId },
    });
    toast.success('Recap generated successfully!');
    await refresh(); // Refresh the page data
  } catch (e: any) {
    generationState.value[seasonId] = { ...generationState.value[seasonId], error: e.message };
    toast.error('Failed to generate recap.', {
      description: e.data?.message || e.message,
    });
  } finally {
    generationState.value[seasonId] = { ...generationState.value[seasonId], pending: false };
  }
};

const goToRecapEditor = (show?: string, season?: string) => {
  navigateTo({
    path: '/recap-editor',
    query: { show, season }
  });
};

const goToRecap = (recapId: string) => {
  navigateTo(`/recap/${recapId}`);
};
</script>
