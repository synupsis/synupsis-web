<template>
  <div class="w-full h-dvh bg-background text-foreground flex flex-col relative overflow-hidden">
    <!-- Background Image -->
    <div v-if="data?.season?.image" class="absolute inset-0 w-full h-full z-0">
      <img :src="data.season.image" alt="Season Poster" class="w-full h-full object-cover opacity-30" />
      <div class="absolute inset-0 bg-background/50 backdrop-blur-lg" />
    </div>

    <!-- Header -->
    <header v-if="data" class="relative z-10 flex-shrink-0 flex items-center justify-between p-2 sm:p-4 border-b border-border/50">
      <Button variant="ghost" @click="goBack" class="w-auto">
        <ChevronLeftIcon class="h-4 w-4 sm:mr-2" />
        <span class="hidden sm:inline">Back to {{ data.show.name }}</span>
      </Button>
      <div class="text-right">
        <h1 class="text-md sm:text-lg font-semibold">{{ data.show.name }}</h1>
        <p class="text-xs sm:text-sm text-muted-foreground">Season {{ data.season.number }}</p>
      </div>
    </header>

    <!-- Main Content -->
    <main class="relative z-10 flex-1 flex flex-col items-center justify-center overflow-hidden min-h-0 p-4">
      <div v-if="pending" class="flex flex-col items-center gap-4">
        <SpinLoader class="h-12 w-12" />
        <p>Loading Recap...</p>
      </div>
      <div v-else-if="error" class="text-destructive text-center">
        <p>Could not load the recap.</p>
        <p class="text-sm">{{ error.data?.message }}</p>
      </div>
      <div v-else-if="data && data.slides.length > 0" class="w-full h-full flex flex-col items-center justify-center gap-4">
        <!-- Canvas Area -->
        <div class="relative aspect-[9/16] h-full max-h-[80vh] bg-neutral/30 rounded-xl overflow-hidden shadow-lg">
          <RecapCanvas
            v-if="currentSlide"
            :key="currentSlide.id"
            :model-value="JSON.stringify(currentSlide.canvas_data)"
            :read-only="true"
            class="animate-fade-in"
          />
        </div>

        <!-- Navigation Controls -->
        <div class="flex items-center gap-4">
          <Button @click="prevSlide" :disabled="currentSlideIndex === 0">
            <ChevronLeftIcon class="h-5 w-5" />
          </Button>
          <p class="text-muted-foreground">{{ currentSlideIndex + 1 }} / {{ data.slides.length }}</p>
          <Button @click="nextSlide" :disabled="currentSlideIndex === data.slides.length - 1">
            <ChevronRightIcon class="h-5 w-5" />
          </Button>
        </div>
      </div>
       <div v-else class="text-muted-foreground">
        This recap has no content yet.
      </div>
    </main>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { Button } from '~/components/shadcn/button';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/vue/24/outline';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import RecapCanvas from '~/components/RecapCanvas.client.vue';

const route = useRoute();
const router = useRouter();
const recapId = route.params.id as string;

const { data, pending, error } = useFetch(`/api/recap/${recapId}`, {
  lazy: true,
});

const goBack = () => {
  router.back();
};

// Slideshow logic
const currentSlideIndex = ref(0);
const currentSlide = computed(() => {
  if (!data.value || !data.value.slides) return null;
  return data.value.slides[currentSlideIndex.value];
});

const nextSlide = () => {
  if (data.value && currentSlideIndex.value < data.value.slides.length - 1) {
    currentSlideIndex.value++;
  }
};

const prevSlide = () => {
  if (currentSlideIndex.value > 0) {
    currentSlideIndex.value--;
  }
};
</script>

<style>
.animate-fade-in {
  animation: fade-in 0.5s ease-out forwards;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>