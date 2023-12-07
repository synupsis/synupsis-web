<template>
  <div>
    <div class="flex w-full justify-center py-10">
      <router-link to="/"><img class="h-32 w-32" src="~/assets/svg/logo.svg" alt="Synupsis"/></router-link>
    </div>
    <Alert v-if="error" title="Something went wrong">
      <p>There was an error</p>
      <p>{{ error }}</p>
    </Alert>
    <div class="py-10">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        <div
            class="mx-auto grid max-w-2xl grid-cols-1 items-start gap-x-8 gap-y-16 sm:gap-y-24 lg:mx-0 lg:max-w-none lg:grid-cols-2">
          <div class="lg:pr-4">
            <div :class="{'animate-pulse': loading}"
                 class="relative overflow-hidden rounded-3xl bg-gray-900 px-6 pb-9 pt-[364px] shadow-2xl sm:px-12 lg:max-w-lg lg:px-8 lg:pb-8 xl:px-10 xl:pb-10">
              <img v-if="data?.image?.original" class="absolute inset-0 h-full w-full object-cover brightness-125 saturate-0"
                   :src="data?.image?.original" alt=""/>
              <div class="absolute inset-0 bg-gray-800 mix-blend-multiply"/>
              <div class="absolute left-1/2 top-1/2 -ml-16 -translate-x-1/2 -translate-y-1/2 transform-gpu blur-3xl"
                   aria-hidden="true">
                <div class="aspect-[1097/845] w-[68.5625rem] bg-gradient-to-tr from-[#ff4694] to-[#776fff] opacity-40"
                     style="clip-path: polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)"/>
              </div>
            </div>
          </div>
          <div>
            <div class="text-base leading-7 text-gray-400 lg:max-w-lg">
              <h2 class="text-3xl mb-4 font-bold tracking-tight text-white sm:text-4xl">{{ data?.name }}</h2>
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
        <ul role="list"
            class="mx-auto mt-20 grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3 lg:gap-8">
          <li v-for="season in data?._embedded?.seasons" :key="season.id" class="rounded-2xl bg-gray-800 px-8 py-10">
            <img v-if="season?.image?.original" class="mx-auto h-48 w-48 rounded-full md:h-56 md:w-56" :src="season?.image?.original" alt=""/>
            <h3 class="mt-6 text-base font-semibold leading-7 tracking-tight text-white">{{ season.name }}</h3>
            <p class="text-sm leading-6 text-gray-400">Season {{ season.number }}</p>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import useSupabase from "~/composables/useSupabase";
import Alert from "~/components/ui/Alert.vue";

const {supabase} = useSupabase();
const loading = ref(true);
const error = ref(null);
const data = ref(null)

onMounted(async () => {
  const router = useRoute()
  loading.value = true;
  const {data: showData, error: showError} = await supabase.functions.invoke('get-show', {
    body: {slug: router.params.slug},
  })
  loading.value = false;

  data.value = showData?.show
  error.value = showError?.message;
})

const people = [
  {
    name: 'Leonard Krasner',
    role: 'Senior Designer',
    imageUrl:
        'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=8&w=1024&h=1024&q=80',
    twitterUrl: '#',
    linkedinUrl: '#',
  },
  // More people...
]
</script>
