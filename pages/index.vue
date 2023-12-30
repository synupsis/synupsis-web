<template>
  <div class="flex flex-col h-screen bg-blue-900">
    <div class="text-right w-screen pt-6 pr-4">
      <div v-if="user">{{ user.email }}</div>
      <div v-else class="flex gap-4 items-center justify-end">
        <router-link to="/login"><Button>Log in</Button></router-link>
        <router-link to="/signup"><Button>Sign up</Button></router-link>
      </div>
    </div>

    <div class="w-full h-screen flex flex-col items-center gap-4 sm:justify-center">
      <Logo class="h-56 w-56" />
      <div class="h-6">
        <TransitionRoot
          :show="!!randomTagline"
          enter="transition-opacity duration-150"
          enter-from="opacity-0"
          enter-to="opacity-100"
          leave="transition-opacity duration-150"
          leave-from="opacity-100"
          leave-to="opacity-0"
        >
          <p class="italic">{{ randomTagline }}</p>
        </TransitionRoot>
      </div>
      <div class="flex items-center justify-center gap-4 w-full px-4">
        <Combobox
          :click-action="goToShow"
          :fetch-items="searchShows"
          :items="items"
          :items-loading="loading"
          :show-chevron-icon="false"
          class="w-full sm:w-80"
          placeholder="Search for a show"
        ></Combobox>
      </div>
      <Alert v-if="error" title="Something went wrong">
        <p>There was an error</p>
        <p>{{ error }}</p>
      </Alert>
    </div>
  </div>
</template>

<script lang="ts" setup>
import Combobox from '~/components/ui/Combobox.vue';
import useSupabase from '~/composables/useSupabase';
import Alert from '~/components/ui/Alert.vue';
import { TransitionRoot } from '@headlessui/vue';
import Button from '~/components/ui/Button.vue';

const { supabase } = useSupabase();

const items = ref([]);
const loading = ref(false);
const error = ref(null);
const randomTagline = ref('');

onMounted(() => {
  const taglines = [
    "Short memory, but don't worry.",
    'Quick Summaries for Every Show',
    'Never Forget What Happened',
    'Binge the Summary, Savor the Show.',
    'Your Series, Briefly.',
    'All Shows, Short and Sweet.',
    'Every Series Summarized.',
    'Your Shortcut to Storylines.',
    'Summing Up Stories'
  ];

  randomTagline.value = taglines[Math.floor(Math.random() * taglines.length)];
});

const searchShows = async (value: any) => {
  loading.value = true;
  const { data: searchData, error: searchError } = await supabase.functions.invoke('search-show', {
    body: { query: value }
  });
  loading.value = false;

  error.value = searchError?.message;

  if (searchData) {
    items.value = searchData.shows.map(show => {
      return {
        name: show.name,
        secondary: `${new Date(show.premiered).getFullYear()} - ${
          show.ended ? new Date(show.ended).getFullYear() : 'Present'
        }`,
        id: show.id
      };
    });
  }
};

const goToShow = (show: any) => {
  const slug = show.name
    .toLowerCase()
    .replace(/ /g, '-')
    .replace(/[^\w-]+/g, '');
  navigateTo({
    path: `/shows/${slug}-${show.id}`,
    params: { slug: `${slug}-${show.id}` }
  });
};

const {
  data: { user }
} = await supabase.auth.getUser();
</script>
