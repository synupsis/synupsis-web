<template>
  <div>
    <div class='flex w-full justify-center py-10'>
      <router-link to='/'>
        <Logo class='h-32 w-32' />
      </router-link>
    </div>
    <Alert v-if='error' title='Something went wrong'>
      <p>There was an error</p>
      <p>{{ error }}</p>
    </Alert>
    <div class='py-10'>
      <div class='mx-auto max-w-7xl px-6 lg:px-8'>
        <div
          class='mx-auto grid max-w-2xl grid-cols-1 items-start gap-x-8 gap-y-16 sm:gap-y-24 lg:mx-0 lg:max-w-none lg:grid-cols-2'>
          <div class='lg:pr-4'>
            <div :class="{'animate-pulse': loading}"
                 class='relative overflow-hidden rounded-3xl bg-gray-900 px-6 pb-9 pt-[364px] shadow-2xl sm:px-12 lg:max-w-lg lg:px-8 lg:pb-8 xl:px-10 xl:pb-10'>
              <img v-if='data?.image'
                   :src='data?.image'
                   alt='' class='absolute inset-0 h-full w-full object-cover brightness-125 saturate-0' />
              <div class='absolute inset-0 bg-gray-800 mix-blend-multiply' />
              <div aria-hidden='true'
                   class='absolute left-1/2 top-1/2 -ml-16 -translate-x-1/2 -translate-y-1/2 transform-gpu blur-3xl'>
                <div class='aspect-[1097/845] w-[68.5625rem] bg-gradient-to-tr from-[#ff4694] to-[#776fff] opacity-40'
                     style='clip-path: polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)' />
              </div>
            </div>
          </div>
          <div>
            <div class='text-base leading-7 text-gray-400 lg:max-w-lg'>
              <h2 class='text-3xl mb-4 font-bold tracking-tight text-white sm:text-4xl'>{{ data?.name }}</h2>
              <div class='max-w-xl'>
                <p class='line-clamp-6' v-html='data?.summary'></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class='py-10'>
      <div class='mx-auto max-w-7xl px-6 text-center lg:px-8'>
        <div class='mx-auto max-w-4xl'>
          <h4 class='text-3xl font-bold tracking-tight text-white sm:text-4xl'>Seasons</h4>
        </div>
        <ul
          class='mx-auto mt-20 grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3 lg:gap-8'
          role='list'>
          <li v-for='season in data?.seasons' :key='season.id'>
            <div
              v-if='false'
              class='rounded-2xl bg-gray-800 px-8 py-10'
            >
              <h3 class='text-base font-semibold leading-7 tracking-tight text-white'>Season {{ season.number }}</h3>
              <p v-if='season.name' class='text-sm leading-6 text-gray-400'>{{ season.name }}</p>
              <div class='flex'>
                <button
                  class='relative block w-full p-4 text-center text-gray-400 hover:text-gray-300 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
                  type='button'
                  @click='showRecap(season)'>
                  <EyeIcon class='mx-auto h-6 w-6' />
                  <span class='mt-2 block text-sm font-semibold'>See recap</span>
                </button>
                <button
                  class='relative block w-full p-4 text-center text-gray-400 hover:text-gray-300 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
                  type='button'>
                  <PencilSquareIcon class='mx-auto h-6 w-6' />
                  <span class='mt-2 block text-sm font-semibold'>Edit recap</span>
                </button>
              </div>
            </div>
            <div v-else class='rounded-lg border-2 border-dashed border-gray-300'>
              <div>
                <div class='bg-white text-gray-900'>
                  <h3 class='text-base font-semibold leading-7 tracking-tight'>Season {{ season.number
                    }}</h3>
                  <p v-if='season.name' class='text-sm leading-6 text-gray-400'>{{ season.name }}</p>
                </div>

                <p class='text-sm mt-2'>No Recap</p>
                <p class='text-sm text-gray-400'>Get started by creating a new recap.</p>
              </div>
              <div class='flex gap-2 divide-white'>
                <button
                  class='relative block w-full px-12 py-6 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 cursor-not-allowed opacity-50'
                  disabled
                  type='button'>
                  <SparklesIcon class='mx-auto h-12 w-12 text-gray-400' />
                  <span class='mt-2 block text-sm font-semibold text-gray-300'>Generate recap (soon)</span>
                </button>
                <button
                  class='relative block w-full px-12 py-6 text-center text-gray-400 hover:text-gray-300 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
                  type='button'
                  @click='goToNewRecap(data?.id, season.id)'>
                  <SquaresPlusIcon class='mx-auto h-12 w-12' />
                  <span class='mt-2 block text-sm font-semibold'>Create a new recap</span>
                </button>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
    <Recap v-model:is-open='isRecapOpen' />
  </div>
</template>
<script lang='ts' setup>
import useSupabase from '~/composables/useSupabase';
import Alert from '~/components/ui/Alert.vue';
import type { Ref } from 'vue';
import type { Show } from '~/types/database.types.ts';
import { EyeIcon, PencilSquareIcon, SparklesIcon, SquaresPlusIcon } from '@heroicons/vue/24/outline';

const { supabase } = useSupabase();
const loading = ref(true);
const error = ref(null);
const data: Ref<Show | null> = ref(null);
const route = useRoute();
const isRecapOpen = ref(false);
const selectedSeason = ref(null);

onMounted(async () => {
  loading.value = true;
  const { data: showData, error: showError } = await supabase.functions.invoke('get-show', {
    body: { slug: route.params.slug }
  });
  loading.value = false;

  data.value = showData?.show;
  error.value = showError?.message;
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
