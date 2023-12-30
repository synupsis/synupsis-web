<template>
  <div class='flex flex-col w-full justify-center items-center p-4'>
    <div v-if='loading'>Loading</div>
    <div v-else class='w-full'>
      <div class='w-full mb-4'>
        <div class='flex w-full justify-between items-center'>
          <h3 class='my-4 text-2xl font-semibold'>Create a new Recap</h3>
          <div class='text-gray-400 p-4 hover:text-gray-300 cursor-pointer transition' @click='goback'>
            <XMarkIcon class='h-7 w-7' />
          </div>
        </div>
        <div class='text-center'>
          <p class='font-semibold text-xl'>{{ showName }}</p>
          <p>Season {{ seasonNumber }}</p>
        </div>

      </div>
      <div class='flex justify-center'>
        <ClientOnly>
          <RecapCanvas :image='showImage' />
        </ClientOnly>
      </div>

      <div class='flex justify-center gap-6 py-8'>
        <div v-for='(slide, index) in slides' class='relative'>
          <div
            class='p-2 rounded-full bg-white absolute -right-3 -top-3 cursor-pointer hover:bg-gray-300 transition shadow'
            @click='removeSlide(slide)'>
            <TrashIcon class='h-4 w-4 text-black' />
          </div>
          <button
            :class='selectedSlideId === slide.id ? "outline-white text-gray-300" : "text-gray-500"'
            class='px-12 py-6 text-center outline outline-2 w-40 rounded-xl hover:text-gray-300 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
            type='button'>
            <p class='text-2xl font-black'>{{ index + 1 }}</p>
            <span class='mt-2 block text-sm font-semibold'>Slide #{{ slide.id }}</span>
          </button>
        </div>


        <button
          class='px-6 py-6 text-center text-gray-400 hover:text-gray-300 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
          type='button'
          @click='addSlide'>
          <SquaresPlusIcon class='mx-auto h-12 w-12' />
          <span class='mt-2 block text-sm font-semibold'>Add a new slide</span>
        </button>
      </div>
      <div class='flex justify-end gap-2'>
        <button
          class='py-2 px-4 bg-blue-600 hover:bg-blue-500 transition shadow rounded-full flex items-center gap-2'
          @click='goback'>
        <span>
          <XCircleIcon class='h-5 w-5' />
        </span>
          Cancel
        </button>
        <button
          class='py-2 px-4 bg-yellow-600 hover:bg-yellow-500 transition shadow rounded-full flex items-center gap-2'>
        <span>
          <ArrowUpCircleIcon class='h-5 w-5' />
        </span>
          Publish recap
        </button>
      </div>
    </div>

  </div>
</template>

<script lang='ts' setup>
import useSupabase from '~/composables/useSupabase';
import type { Ref } from 'vue';
import { ArrowUpCircleIcon, SquaresPlusIcon, TrashIcon, XCircleIcon, XMarkIcon } from '@heroicons/vue/24/outline';

const loading = ref(false);
const error: Ref<string | undefined> = ref(undefined);
const showName: Ref<string | undefined> = ref(undefined);
const showImage: Ref<string | undefined> = ref(undefined);
const seasonNumber: Ref<number | undefined> = ref(undefined);
const route = useRoute();
const router = useRouter();

const slides = ref([{ id: 1 }, { id: 2 }]);
const selectedSlideId = ref(1);

const { supabase } = useSupabase();

onMounted(async () => {
  loading.value = true;
  const { data: showData, error: showError } = await supabase
    .from('show')
    .select('name, image')
    .eq('id', route?.query?.show ?? '')
    .maybeSingle();

  const { data: seasonData, error: seasonError } = await supabase
    .from('season')
    .select('number')
    .eq('id', route?.query?.season ?? '')
    .maybeSingle();


  showName.value = showData?.name;
  showImage.value = showData?.image;
  seasonNumber.value = seasonData?.number;
  error.value = showError?.message ?? seasonError?.message ?? undefined;
  loading.value = false;
});

const goback = () => {
  router.back();
};

const addSlide = () => {
  const id = slides.value.length + 1;
  slides.value.push({ id });
};

const removeSlide = (slide: any) => {
  slides.value = slides.value.filter((s) => s.id !== slide.id);
};


</script>
