<template>
  <div class="flex flex-col w-full justify-center items-center p-4">
    <Alert v-if="error" variant="destructive">
      <AlertTitle>Error loading data</AlertTitle>
      <AlertDescription>
        {{ error.message }}
        <Button class="mt-2" @click="goBack">Go Back</Button>
      </AlertDescription>
    </Alert>
    <div v-else class="w-full">
      <div class="w-full mb-4">
        <div class="flex w-full justify-between items-center">
          <h3 class="my-4 text-2xl font-semibold">Create a new Recap</h3>
          <div
            class="text-gray-400 p-4 hover:text-gray-300 cursor-pointer transition"
            @click="goBack"
          >
            <XMarkIcon class="h-7 w-7" />
          </div>
        </div>
        <div class="text-center flex items-center flex-col">
          <div v-if="loading" class="flex flex-col items-center gap-2">
            <div class="skeleton h-6 w-32"></div>
            <div class="skeleton h-5 w-20"></div>
          </div>
          <template v-else>
            <p class="font-semibold text-xl transition-opacity">{{ showName }}</p>
            <p>Season {{ seasonNumber }}</p>
          </template>
        </div>
      </div>
      <div class="flex justify-center">
        <RecapCanvas
          :image="showImage"
          :json="selectedSlide?.canvas"
          :loading="loading"
          @update:json="updateSlideCanvas"
        />
      </div>

      <div class="flex justify-center gap-6 py-8 overflow-x-auto">
        <div v-for="(slide, index) in slides" :key="slide.id" class="relative flex-shrink-0">
          <div
            class="btn rounded-full bg-white absolute -right-3 -top-3 cursor-pointer hover:bg-gray-300 transition shadow-lg z-10"
            @click="removeSlide(slide)"
          >
            <TrashIcon class="h-4 w-4 text-black" />
          </div>
          <button
            :class="selectedSlideId === slide.id ? 'outline-white text-gray-300' : 'text-gray-500'"
            class="px-12 py-6 text-center outline outline-2 w-40 rounded-xl hover:text-gray-300 transition focus:ring-0"
            type="button"
            @click="selectSlide(slide)"
          >
            <p class="text-2xl font-black">{{ index + 1 }}</p>
            <span class="mt-2 block text-sm font-semibold">Slide #{{ slide.id }}</span>
          </button>
        </div>

        <button
          class="px-6 py-6 text-center text-gray-400 hover:text-gray-300 transition focus:ring-0 flex-shrink-0"
          type="button"
          @click="addSlide"
        >
          <SquaresPlusIcon class="mx-auto h-12 w-12" />
          <span class="mt-2 block text-sm font-semibold">Add a new slide</span>
        </button>
      </div>
      <div class="flex justify-end gap-2">
        <button class="py-2 px-4 btn btn-neutral gap-2" @click="goBack">
          <XCircleIcon class="h-5 w-5" />
          <span>Cancel</span>
        </button>
        <button class="py-2 px-4 btn btn-primary" :disabled="isPublishing" @click="publishRecap">
          <span v-if="isPublishing" class="loading loading-spinner"></span>
          <ArrowUpCircleIcon v-else class="h-5 w-5" />
          <span>{{ isPublishing ? 'Publishing...' : 'Publish Recap' }}</span>
        </button>
      </div>
      <Alert v-if="publicationError" variant="destructive" class="mt-4">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          {{ publicationError }}
        </AlertDescription>
      </Alert>
      <Alert v-if="publicationSuccess" class="mt-4">
        <AlertTitle>Success</AlertTitle>
        <AlertDescription>
          {{ publicationSuccess }}
        </AlertDescription>
      </Alert>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import {
  ArrowUpCircleIcon,
  SquaresPlusIcon,
  TrashIcon,
  XCircleIcon,
  XMarkIcon
} from '@heroicons/vue/24/outline';
import { useRoute, useRouter } from 'vue-router';
import useSupabase from '~/composables/useSupabase';
import type { Show, Season } from '~/types/database.types';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import Button from '~/components/ui/Button.vue';

type Slide = {
  id: number;
  canvas: string;
};

const route = useRoute();
const router = useRouter();
const supabase = useSupabase();

const showId = computed(() => route.query.show as string | undefined);
const seasonId = computed(() => route.query.season as string | undefined);

const {
  data: pageData,
  pending: loading,
  error
} = useAsyncData(
  `new-recap-data-${showId.value}-${seasonId.value}`,
  async () => {
    if (!showId.value || !seasonId.value) {
      throw new Error('Show ID and Season ID are required.');
    }

    const [showResult, seasonResult] = await Promise.all([
      supabase.from('show').select('id, name, image').eq('id', showId.value).single(),
      supabase.from('season').select('id, number').eq('id', seasonId.value).single()
    ]);

    if (showResult.error) throw showResult.error;
    if (seasonResult.error) throw seasonResult.error;

    return {
      show: showResult.data as Show,
      season: seasonResult.data as Season
    };
  },
  {
    watch: [showId, seasonId]
  }
);

const showName = computed(() => pageData.value?.show?.name);
const showImage = computed(() => pageData.value?.show?.image);
const seasonNumber = computed(() => pageData.value?.season?.number);

const slides = ref<Slide[]>([
  { id: 1, canvas: '' },
  { id: 2, canvas: '' }
]);
const selectedSlideId = ref(1);
const selectedSlide = computed(
  () => slides.value.find(s => s.id === selectedSlideId.value) ?? slides.value[0]
);

const goBack = () => router.back();

const addSlide = () => {
  const newId = (slides.value.at(-1)?.id ?? 0) + 1;
  slides.value.push({ id: newId, canvas: '' });
  selectedSlideId.value = newId;
};

const removeSlide = (slideToRemove: Slide) => {
  if (slides.value.length <= 1) return; // Prevent removing the last slide
  if (selectedSlideId.value === slideToRemove.id) {
    const currentIndex = slides.value.findIndex(s => s.id === slideToRemove.id);
    selectedSlideId.value = slides.value[currentIndex - 1]?.id ?? slides.value[0]?.id;
  }
  slides.value = slides.value.filter(s => s.id !== slideToRemove.id);
};

const selectSlide = (slide: Slide) => {
  selectedSlideId.value = slide.id;
};

const updateSlideCanvas = (canvas: string) => {
  if (selectedSlide.value) {
    selectedSlide.value.canvas = canvas;
  }
};

const publicationError = ref('');
const publicationSuccess = ref('');

const { pending: isPublishing, execute: publishRecap } = useFetch('/api/recap/create', {
  method: 'POST',
  body: {
    showId: showId.value,
    seasonId: seasonId.value,
    slides
  },
  immediate: false,
  onResponse({ response }) {
    if (response.ok) {
      publicationSuccess.value = 'Recap published successfully!';
      setTimeout(() => {
        router.push(`/shows/${pageData.value?.show?.name}-${showId.value}`);
      }, 2000);
    }
  },
  onResponseError({ response }) {
    publicationError.value = response._data?.message || 'Failed to publish recap.';
  }
});
</script>
