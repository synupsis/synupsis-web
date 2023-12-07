<template>
  <div class="w-full h-screen flex flex-col items-center gap-4 sm:justify-center">
    <div class="relative h-56 w-56 overflow-hidden rounded-3xl">
      <img src="~/assets/svg/logo.svg" alt="Synupsis"/>
      <div class="bg"></div>
    </div>
    <div class="h-6">
      <TransitionRoot :show="!!randomTagline"
                      enter="transition-opacity duration-75"
                      enter-from="opacity-0"
                      enter-to="opacity-100"
                      leave="transition-opacity duration-150"
                      leave-from="opacity-100"
                      leave-to="opacity-0">
        <p class="italic">{{ randomTagline }}</p>
      </TransitionRoot>
    </div>
    <div class="flex items-center justify-center gap-4 w-full px-4">
      <Combobox :fetch-items="searchShows" :items="items" :items-loading="loading" :click-action="goToShow"
                class="w-full sm:w-80" :show-chevron-icon="false"
                placeholder="Search for a show"></Combobox>
    </div>
    <Alert v-if="error" title="Something went wrong">
      <p>There was an error</p>
      <p>{{ error }}</p>
    </Alert>
  </div>
</template>
<script setup lang="ts">
import Combobox from "~/components/ui/Combobox.vue";
import useSupabase from "~/composables/useSupabase";
import Alert from "~/components/ui/Alert.vue";
import {TransitionRoot} from '@headlessui/vue'

const router = useRouter()

const {supabase} = useSupabase();

const items = ref([]);
const loading = ref(false);
const error = ref(null);
const randomTagline = ref('');

onMounted(() => {
  const taglines = [
    "Short memory, but don't worry.",
    "Quick Summaries for Every Show",
    "Never Forget What Happened",
    "Binge the Summary, Savor the Show.",
    "Your Series, Briefly.",
    "All Shows, Short and Sweet.",
    "Every Series Summarized.",
    "Your Shortcut to Storylines.",
    "Summing Up Stories"
  ]

  randomTagline.value = taglines[Math.floor(Math.random() * taglines.length)];
})

const searchShows = async (value: any) => {
  loading.value = true;
  const {data: searchData, error: searchError} = await supabase.functions.invoke('search-show', {
    body: {query: value},
  })
  loading.value = false;

  error.value = searchError?.message;

  if (searchData) {
    items.value = searchData.shows.map((show) => {
      return {
        name: show.name,
        secondary: `${new Date(show.premiered).getFullYear()} - ${show.ended ? new Date(show.ended).getFullYear() : 'Present'}`,
        id: show.id,
      }
    })
  }


}

const goToShow = (show: any) => {
  const slug = show.name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
  navigateTo({
    path: `/shows/${slug}-${show.id}`,
    params: {slug: `${slug}-${show.id}`},
  })
}

</script>

<style scoped lang="scss">
body {
  background-color: #111111;
  margin: 0;
  overflow-x: hidden;
}

.bg {
  position: absolute;
  top: -50%;
  left: -50%;
  right: -50%;
  bottom: -50%;
  width: 200%;
  height: 200%;
  background: transparent url('http://assets.iceable.com/img/noise-transparent.png') repeat 0 0;
  animation: bg-animation .2s infinite;
  opacity: .9;
  visibility: visible;
  -webkit-mask-image: url(assets/svg/logo.svg);
  mask-image: url(assets/svg/logo.svg);
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}

@keyframes bg-animation {
  0% {
    transform: translate(0, 0)
  }
  10% {
    transform: translate(-5%, -5%)
  }
  20% {
    transform: translate(-10%, 5%)
  }
  30% {
    transform: translate(5%, -10%)
  }
  40% {
    transform: translate(-5%, 15%)
  }
  50% {
    transform: translate(-10%, 5%)
  }
  60% {
    transform: translate(15%, 0)
  }
  70% {
    transform: translate(0, 10%)
  }
  80% {
    transform: translate(-15%, 0)
  }
  90% {
    transform: translate(10%, 5%)
  }
  100% {
    transform: translate(5%, 0)
  }
}
</style>
