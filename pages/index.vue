<template>
  <div>
    <div class="w-full flex flex-col items-center gap-4 sm:justify-center">
      <div
        class="relative flex w-full h-[600px] flex-col items-center justify-center overflow-hidden rounded-lg lg:w-full md:w-full"
      >
        <div class="absolute top-5 right-5 text-right w-full">
          <SpinLoader v-if="userLoading" class="h-5 w-5" />
          <div v-else-if="user">{{ user.email }}</div>
          <div v-else class="flex gap-4 items-center justify-end">
            <router-link to="/login">
              <RippleButton>Log in</RippleButton>
            </router-link>
            <router-link to="/signup">
              <RippleButton>Sign up</RippleButton>
            </router-link>
          </div>
        </div>
        <Logo class="z-10 h-56 w-56" />
        <div class="absolute w-full p-2 flex flex-col items-center mt-[400px]">
          <img alt="Synupsis" class="w-80" src="~/assets/svg/logo_text.svg" />
          <div class="h-6">
            <HeadlessTransitionRoot
              :show="!!randomTagline"
              enter="transition-opacity duration-150"
              enter-from="opacity-0"
              enter-to="opacity-100"
              leave="transition-opacity duration-150"
              leave-from="opacity-100"
              leave-to="opacity-0"
            >
              <p class="italic text-pretty">{{ randomTagline }}</p>
            </HeadlessTransitionRoot>
          </div>
          <VanishingInput
            v-model="text"
            :loading="loading"
            :placeholders="placeholders"
            class="mt-8"
          />
        </div>
        <Ripple
          circle-class="border-[hsl(var(--primary))] bg-[#0000]/25 dark:bg-[#fff]/25 rounded-[50px]"
          class="bg-white/5 [mask-image:linear-gradient(to_bottom,white,transparent)]"
        />
      </div>
      <div class="w-full max-w-xl text-left">
        <ClientOnly>
          <BlurReveal
            v-if="items.length"
            :delay="0.2"
            :duration="0.75"
            class="px-4 flex flex-col gap-4 mt-2"
          >
            <div
              v-for="show in items"
              :key="show.id"
              class="flex items-center gap-4 py-1 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
              @click="goToShow(show)"
            >
              <p class="text-pretty text-lg">
                <span class="font-bold">{{ show.name }}</span> {{ show.secondary }}
              </p>
              <div class="bg-white/10 rounded-full">
                <ChevronRightIcon class="w-5 h-5 m-1" />
              </div>
            </div>
          </BlurReveal>
        </ClientOnly>
      </div>
      <div v-if="error" class="flex h-[500px] flex-col gap-4 lg:h-[250px] lg:flex-row">
        <CardSpotlight
          class="flex-col items-center justify-center whitespace-nowrap shadow-2xl px-14"
          gradient-color="#363636"
        >
          <p class="text-4xl text-red-400">Oops. There was an error.</p>

          <p>{{ error }}</p>
        </CardSpotlight>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import Ripple from '~/components/ui/Ripple.vue';
import VanishingInput from '~/components/ui/VanishingInput.vue';
import RippleButton from '~/components/ui/RippleButton.vue';
import CardSpotlight from '~/components/ui/CardSpotlight.vue';
import type { TvMazeShow } from '~/types/tv-maze.types';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import type { Ref } from 'vue';
import type { User } from '@supabase/auth-js';
import BlurReveal from '~/components/ui/BlurReveal.vue';
import { ChevronRightIcon } from '@heroicons/vue/16/solid';

const items = ref([]);
const loading = ref(false);
const userLoading = ref(false);
const error: Ref<string | null> = ref(null);
const randomTagline = ref('');
const user: Ref<User | null> = ref(null);
const supabase = useSupabase();
const { slugify } = useUtils();

const placeholders = ['Breaking Bad', 'Lost', 'How I Met Your Mother', 'Friends', 'Severance'];
const text = ref('');

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

const fetchUser = async () => {
  userLoading.value = true;
  try {
    const {
      data: { user: userResult }
    } = await supabase.auth.getUser();
    user.value = userResult;
  } finally {
    userLoading.value = false;
  }
};

const setLoading = (state: boolean) => {
  loading.value = state;
};

onMounted(async () => {
  randomTagline.value = taglines[Math.floor(Math.random() * taglines.length)];
  await fetchUser();
});

watch(text, () => {
  if (text.value.length > 2) {
    searchShows(text.value);
  } else {
    items.value = [];
  }
});

const searchShows = async (value: string) => {
  setLoading(true);
  try {
    const { data: searchData, error: searchError } = await supabase.functions.invoke(
      'search-show',
      {
        body: { query: value }
      }
    );
    if (searchError) throw searchError;
    if (Array.isArray(searchData?.shows)) {
      items.value = searchData.shows.map((show: TvMazeShow) => {
        return {
          name: show.name,
          secondary: `${new Date(show.premiered).getFullYear()} - ${
            show.ended ? new Date(show.ended).getFullYear() : 'Present'
          }`,
          id: show.id
        };
      });
    } else {
      throw new Error('Invalid data format: shows should be an array');
    }
  } catch (err) {
    console.error('Error searching shows:', err);
    error.value = 'Failed to search for shows.';
  } finally {
    setLoading(false);
  }
};

const goToShow = (show: TvMazeShow) => {
  const slug = slugify(show.name);
  navigateTo({
    path: `/shows/${slug}-${show.id}`,
    params: { slug: `${slug}-${show.id}` }
  });
};
</script>
