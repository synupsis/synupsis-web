<template>
  <div v-if="error" class="w-full h-screen flex flex-col items-center justify-center gap-4">
    <p class="text-destructive">Failed to load show data.</p>
    <Button @click="refresh">Try Again</Button>
  </div>
  <div v-else class="w-full">
    <!-- Header -->
    <header class="absolute top-0 left-0 z-10 flex w-full justify-between items-center py-6 px-8">
      <router-link to="/">
        <img src="/svg/logo_text.svg" alt="Synupsis Logo" class="h-8 hover:opacity-70 transition-opacity" />
      </router-link>
      <UserAuthStatus />
    </header>

    <!-- Hero Section -->
    <div v-if="data"
      class="relative w-full h-[60vh] bg-cover bg-center bg-no-repeat"
      :style="{ backgroundImage: `url(${data.image})` }"
    >
      <div class="absolute top-0 left-0 right-0 h-72 bg-gradient-to-b from-black to-transparent z-0" />
      <div class="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      <div class="relative h-full flex flex-col justify-end items-start p-8 md:p-12 lg:p-16">
        <div class="max-w-3xl text-white animate-fade-in-up">
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
            <div class="mt-6">
              <p class="text-base md:text-lg line-clamp-3" v-html="data.summary" />
              <AlertDialog>
                <AlertDialogTrigger as-child>
                  <Button variant="link" class="text-white -mx-3">Read more</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Summary</AlertDialogTitle>
                    <AlertDialogDescription class="max-h-[60vh] overflow-y-auto" v-html="data.summary" />
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Close</AlertDialogCancel>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
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
        <!-- Latest Season CTA -->
        <div v-if="latestSeasonRecap" class="mb-12 p-6 rounded-lg bg-secondary/50 border border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 class="text-xl font-bold">Catch up before the next episode!</h3>
            <p class="text-muted-foreground">The recap for the latest season is available now.</p>
          </div>
          <Button size="lg" @click="goToRecap(latestSeasonRecap.id)">
            <EyeIcon class="mr-2 h-5 w-5" />
            Watch Season {{ sortedSeasons[0].number }} Recap
          </Button>
        </div>

        <h2 class="text-3xl font-bold tracking-tight text-white sm:text-4xl mb-10">Seasons</h2>
        <!-- Real Seasons -->
        <Carousel v-if="data && data.seasons.length > 0" class="w-full">
          <CarouselContent class="-ml-4">
            <CarouselItem v-for="(season, index) in sortedSeasons" :key="season.id" class="pl-4 basis-4/5 sm:basis-1/2 md:basis-1/3 lg:basis-1/4 xl:basis-1/5">
              <SeasonCard
                :season="season"
                :is-admin="isAdmin"
                :is-generating="generationState[season.id]?.pending ?? false"
                :is-latest="index === 0"
                @view="goToRecap"
                @edit="goToRecapEditor(data.id, season.id)"
                @create="goToRecapEditor(data.id, season.id)"
                @generate="generateRecap(data.id, season.id)"
              />
            </CarouselItem>
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
        <div v-else-if="data" class="text-muted-foreground">
          No seasons found for this show.
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

    <!-- Cast Section -->
    <div v-if="data" class="py-16 bg-background">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 class="text-3xl font-bold tracking-tight text-white sm:text-4xl mb-10">Cast</h2>
        <div v-if="data._embedded?.cast?.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-8">
          <CastMemberCard v-for="member in data._embedded.cast" :key="member.person.id" :cast-member="member" />
        </div>
        <div v-else class="text-muted-foreground">
          No cast information available for this show.
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { ref, watchEffect, computed } from 'vue';
import type { TvMazeShow } from '~/types/tv-maze.types';
import { CalendarIcon, StarIcon, TvIcon, EyeIcon } from '@heroicons/vue/24/outline';
import { toast } from 'vue-sonner';
import { Badge } from '~/components/shadcn/badge';
import { Button } from '~/components/shadcn/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/components/shadcn/alert-dialog';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '~/components/shadcn/carousel';
import UserAuthStatus from '~/components/UserAuthStatus.vue';
import ShowPageSkeleton from '~/components/ShowPageSkeleton.vue';
import SeasonCard from '~/components/SeasonCard.vue';
import CastMemberCard from '~/components/CastMemberCard.vue';

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

const { data, pending, error, refresh } = useAsyncData(
  `show-data-${route.params.slug}`,
  async () => {
    const tvMazeId = (route.params.slug as string).split('-').pop();
    if (!tvMazeId) {
      console.error('Invalid slug format');
      throw new Error('Invalid slug');
    }
    try {
      const response = await $fetch(`/api/shows/${tvMazeId}`);
      return response.show as TvMazeShow | null;
    } catch (e: any) {
      toast.error('Failed to fetch show data.', { description: e.data?.statusMessage || e.message });
      throw e; // Re-throw to be caught by useAsyncData
    }
  },
  { lazy: true }
);

const isRecapOpen = ref(false);
const generationState = ref<Record<string, { pending: boolean; error: string | null }>>({});

const sortedSeasons = computed(() => {
  if (!data.value?.seasons) return [];
  return [...data.value.seasons].sort((a, b) => b.number - a.number);
});

const latestSeasonRecap = computed(() => {
  if (!sortedSeasons.value.length) return null;
  const latestSeason = sortedSeasons.value[0];
  return (latestSeason.recap || []).find((r: any) => r.status === 'published');
});

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

// SEO and Social Sharing Optimization
useHead(() => {
  if (!data.value) {
    return {
      title: 'Synupsis',
    };
  }
  const title = `Synupsis - ${data.value.name}`;
  const description = data.value.summary
    ? data.value.summary.replace(/<[^>]*>?/gm, '').substring(0, 155) + '...'
    : `Find all the recaps for ${data.value.name}.`;

  return {
    title,
    meta: [
      { name: 'description', content: description },
      // Open Graph
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:image', content: data.value.image?.original ?? '/svg/logo.svg' },
      { property: 'og:type', content: 'website' },
      // Twitter Card
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: data.value.image?.original ?? '/svg/logo.svg' },
    ],
  };
});
</script>
