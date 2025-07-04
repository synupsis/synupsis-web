<template>
  <div>
    <div class="flex w-full justify-center py-10">
      <router-link to="/">
        <Logo class="h-32 w-32" />
      </router-link>
    </div>
    <div class="py-10">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        <div
          class="mx-auto grid max-w-2xl grid-cols-1 items-start gap-x-8 gap-y-16 sm:gap-y-24 lg:mx-0 lg:max-w-none lg:grid-cols-2"
        >
          <div class="lg:pr-4">
            <div
              :class="{ 'animate-pulse': loading }"
              class="relative overflow-hidden rounded-3xl bg-gray-900 px-6 pb-9 pt-[364px] shadow-2xl sm:px-12 lg:max-w-lg lg:px-8 lg:pb-8 xl:px-10 xl:pb-10"
            >
              <img
                v-if="data?.image?.medium"
                :src="data?.image?.medium"
                alt=""
                class="absolute inset-0 h-full w-full object-cover brightness-125 saturate-0"
              />
              <div class="absolute inset-0 bg-gray-800 mix-blend-multiply" />
              <div
                aria-hidden="true"
                class="absolute left-1/2 top-1/2 -ml-16 -translate-x-1/2 -translate-y-1/2 transform-gpu blur-3xl"
              >
                <div
                  class="aspect-[1097/845] w-[68.5625rem] bg-gradient-to-tr from-[#ff4694] to-[#776fff] opacity-40"
                  style="
                    clip-path: polygon(
                      74.1% 44.1%,
                      100% 61.6%,
                      97.5% 26.9%,
                      85.5% 0.1%,
                      80.7% 2%,
                      72.5% 32.5%,
                      60.2% 62.4%,
                      52.4% 68.1%,
                      47.5% 58.3%,
                      45.2% 34.5%,
                      27.5% 76.7%,
                      0.1% 64.9%,
                      17.9% 100%,
                      27.6% 76.8%,
                      76.1% 97.7%,
                      74.1% 44.1%
                    );
                  "
                />
              </div>
            </div>
          </div>
          <div>
            <div class="text-base leading-7 text-white lg:max-w-lg">
              <h1 class="text-balance mb-4 text-5xl font-extrabold leading-none tracking-tighter">
                {{ data?.name }}
              </h1>
              <div class="max-w-xl">
                <p class="line-clamp-6" v-html="data?.summary"></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="py-10">
      <div class="mx-auto max-w-7xl px-6 text-center lg:px-8">
        <div class="mx-auto max-w-4xl">
          <h4 class="text-3xl font-bold tracking-tight text-white sm:text-4xl">Seasons</h4>
        </div>
        <div
          class="mx-auto mt-20 grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3 lg:gap-8"
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
import InteractiveHoverButton from '~/components/ui/InteractiveHoverButton.vue';
import RecapBackgroundModal from '~/components/RecapBackgroundModal.vue';
import RecapCanvas from '~/components/RecapCanvas.vue';
import useSupabase from '~/composables/useSupabase';
import type { Database } from '~/types/database.types';
import type { TvMazeShow } from '~/types/tv-maze.types';
import { EyeIcon, PencilSquareIcon, SparklesIcon, SquaresPlusIcon } from '@heroicons/vue/24/outline';
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
