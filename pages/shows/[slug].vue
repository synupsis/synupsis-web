<template>
  <div class="w-full">
    <!-- Header -->
    <div class="flex w-full justify-center py-6">
      <router-link to="/">
        <Logo class="h-24 w-24" />
      </router-link>
    </div>

    <!-- Hero Section -->
    <div
      class="relative w-full h-[60vh] bg-cover bg-center bg-no-repeat"
      :style="{ backgroundImage: `url(${data?.image ?? data?.image?.original})` }"
    >
      <div class="absolute inset-0 bg-black/60 bg-gradient-to-t from-background to-transparent" />
      <div class="relative h-full flex flex-col justify-end items-start p-8 md:p-12 lg:p-16">
        <div class="max-w-3xl text-white">
          <div class="flex flex-wrap gap-2 mb-4">
            <Badge v-for="genre in data?.genres" :key="genre" variant="secondary">{{ genre }}</Badge>
          </div>
          <h1 class="text-4xl md:text-6xl font-extrabold tracking-tighter text-balance">
            {{ data?.name }}
          </h1>
          <div class="flex items-center flex-wrap gap-x-4 gap-y-2 mt-4 text-lg text-muted-foreground">
            <div v-if="data?.rating?.average" class="flex items-center gap-1">
              <StarIcon class="h-5 w-5 text-yellow-400" />
              <span>{{ data.rating.average }} / 10</span>
            </div>
            <div v-if="data?.status" class="flex items-center gap-1">
              <TvIcon class="h-5 w-5" />
              <span>{{ data.status }}</span>
            </div>
            <div v-if="data?.premiered" class="flex items-center gap-1">
              <CalendarIcon class="h-5 w-5" />
              <span>{{ new Date(data.premiered).getFullYear() }}</span>
            </div>
          </div>
          <p class="mt-6 text-base md:text-lg line-clamp-3" v-html="data?.summary" />
        </div>
      </div>
    </div>

    <!-- Seasons Section -->
    <div class="py-16">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 class="text-3xl font-bold tracking-tight text-white sm:text-4xl mb-10">Seasons</h2>
        <div
          class="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:gap-8"
        >
          <Card v-for="season in data?.seasons" :key="season.id" class="flex flex-col">
            <CardHeader>
              <CardTitle>Season {{ season.number }}</CardTitle>
              <CardDescription v-if="season.name">{{ season.name }}</CardDescription>
            </CardHeader>
            <CardContent class="flex-grow">
              <p class="text-sm text-muted-foreground">
                No recap available for this season yet.
              </p>
            </CardContent>
            <CardFooter class="flex flex-col items-stretch gap-2">
              <Button disabled variant="outline">
                <SparklesIcon class="mr-2 h-4 w-4" />
                Generate (soon)
              </Button>
              <Button @click="goToNewRecap(data?.id, season.id)">
                <SquaresPlusIcon class="mr-2 h-4 w-4" />
                Create Recap
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>

    <Recap v-model:is-open="isRecapOpen" />
  </div>
</template>
<script lang="ts" setup>
import useSupabase from '~/composables/useSupabase';
import type { TvMazeShow } from '~/types/tv-maze.types';
import { CalendarIcon, SparklesIcon, SquaresPlusIcon, StarIcon, TvIcon } from '@heroicons/vue/24/outline';
import { toast } from 'vue-sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/shadcn/card'
import { Button } from '~/components/shadcn/button'
import { Badge } from '~/components/shadcn/badge'

const supabase = useSupabase();
const loading = ref(true);
const data: Ref<TvMazeShow | null> = ref(null);
const route = useRoute();
const isRecapOpen = ref(false);
const selectedSeason = ref(null);

onMounted(async () => {
  loading.value = true;
  try {
    const response = await $fetch(`/api/shows/${route.params.slug}`);
    data.value = response.show;
  } catch (e: any) {
    toast.error('Something went wrong', {
      description: e.message
    })
  } finally {
    loading.value = false;
  }
});

const showRecap = (season: any) => {
  isRecapOpen.value = true;
  selectedSeason.value = season;
};

const goToNewRecap = (show?: string, season?: string) => {
  navigateTo({
    path: '/new-recap',
    query: { show, season }
  });
};
</script>
