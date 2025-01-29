<template>
  <div class="flex flex-col w-full justify-center items-center p-4">
    <div class="w-full">
      <div class="w-full mb-4">
        <div class="flex w-full justify-between items-center">
          <h3 class="my-4 text-2xl font-semibold">Create a new Recap</h3>
          <div
            class="text-gray-400 p-4 hover:text-gray-300 cursor-pointer transition"
            @click="goback"
          >
            <XMarkIcon class="h-7 w-7" />
          </div>
        </div>
        <div class="text-center flex items-center flex-col">
          <div v-if="loading || !showName" class="flex gap-1">
            <div class="skeleton h-6 w-14"></div>
            <div class="skeleton h-6 w-8"></div>
            <div class="skeleton h-6 w-20"></div>
          </div>
          <p v-else class="font-semibold text-xl transition-opacity">{{ showName }}</p>
          <div v-if="loading || !seasonNumber" class="flex gap-1 mt-2">
            <div class="skeleton h-5 w-16"></div>
            <div class="skeleton h-5 w-4"></div>
          </div>
          <p v-else>Season {{ seasonNumber }}</p>
        </div>
      </div>
      <div class="flex justify-center">
        <RecapCanvas
          :image="showImage"
          :json="selectedSlide?.canvas"
          :loading="loading"
          @update:json="updateSlide"
        />
      </div>

      <div class="flex justify-center gap-6 py-8">
        <div v-for="(slide, index) in slides" class="relative">
          <div
            class="btn rounded-full bg-white absolute -right-3 -top-3 cursor-pointer hover:bg-gray-300 transition shadow-lg"
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
          class="px-6 py-6 text-center text-gray-400 hover:text-gray-300 transition focus:ring-0"
          type="button"
          @click="addSlide"
        >
          <SquaresPlusIcon class="mx-auto h-12 w-12" />
          <span class="mt-2 block text-sm font-semibold">Add a new slide</span>
        </button>
      </div>
      <div class="flex justify-end gap-2">
        <button class="py-2 px-4 btn btn-neutral gap-2" @click="goback">
          <span>
            <XCircleIcon class="h-5 w-5" />
          </span>
          Cancel
        </button>
        <button class="py-2 px-4 btn btn-primary" @click="createRecap">
          <span>
            <ArrowUpCircleIcon class="h-5 w-5" />
          </span>
          Publish recap
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import useSupabase from '~/composables/useSupabase';
import type { Ref } from 'vue';
import {
  ArrowUpCircleIcon,
  SquaresPlusIcon,
  TrashIcon,
  XCircleIcon,
  XMarkIcon
} from '@heroicons/vue/24/outline';

const loading = ref(false);
const error: Ref<string | undefined> = ref(undefined);
const showId: Ref<string | undefined> = ref(undefined);
const seasonId: Ref<string | undefined> = ref(undefined);
const showName: Ref<string | undefined> = ref(undefined);
const showImage: Ref<string | undefined> = ref(undefined);
const seasonNumber: Ref<number | undefined> = ref(undefined);
const route = useRoute();
const router = useRouter();

type Slide = {
  id: number;
  canvas: string;
};

const slides: Ref<Array<Slide>> = ref([
  { id: 1, canvas: '' },
  { id: 2, canvas: '' }
]);
const selectedSlideId = ref(1);
const selectedSlide = computed(
  () => slides.value.find(s => s.id === selectedSlideId.value) ?? slides.value[0]
);

const supabase = useSupabase();

onMounted(async () => {
  loading.value = true;
  const { data: showData, error: showError } = await supabase
    .from('show')
    .select('id, name, image')
    .eq('id', route?.query?.show ?? '')
    .maybeSingle();

  const { data: seasonData, error: seasonError } = await supabase
    .from('season')
    .select('id, number')
    .eq('id', route?.query?.season ?? '')
    .maybeSingle();

  showId.value = showData?.id;
  showName.value = showData?.name;
  showImage.value = showData?.image;
  seasonId.value = seasonData?.id;
  seasonNumber.value = seasonData?.number;
  error.value = showError?.message ?? seasonError?.message ?? undefined;
  loading.value = false;
});

const goback = () => {
  router.back();
};

const addSlide = () => {
  const id = slides.value.length + 1;
  slides.value.push({ id, canvas: '' });
};

const removeSlide = (slide: Slide) => {
  if (selectedSlideId.value === slide.id) {
    selectedSlideId.value = slides.value[0].id;
  }
  slides.value = slides.value.filter(s => s.id !== slide.id);
};

const selectSlide = (slide: Slide) => {
  selectedSlideId.value = slide.id;
};

const updateSlide = (canvas: string) => {
  selectedSlide.value.canvas = canvas;
};

const createRecap = async () => {
  console.log('create recap');
  const { data, error } = await supabase.functions.invoke('create-recap', {
    body: { foo: 'bar', slides: slides.value, seasonId: seasonId.value, showId: showId.value }
  });
  console.log(route?.query?.show);
  console.log(data, error);
};
</script>
