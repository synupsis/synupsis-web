<template>
  <div class="w-full h-dvh bg-background text-foreground flex flex-col relative overflow-hidden">
    <!-- Background Image -->
    <div v-if="data?.season?.image" class="absolute inset-0 w-full h-full z-0">
      <img :src="data.season.image" alt="Season Poster" class="w-full h-full object-cover opacity-30" />
      <div class="absolute inset-0 bg-background/50 backdrop-blur-lg" />
    </div>

    <!-- Header -->
    <header v-if="data" class="relative z-30 flex-shrink-0 flex items-center justify-between p-2 sm:p-4 border-b border-border/50">
      <Button variant="ghost" @click="goBack" class="w-auto bg-transparent hover:bg-transparent">
        <ChevronLeftIcon class="h-4 w-4 sm:mr-2" />
        <span class="hidden sm:inline">Back to {{ data.show.name }}</span>
      </Button>
      <div class="text-right">
        <h1 class="text-md sm:text-lg font-semibold">{{ data.show.name }}</h1>
        <p class="text-xs sm:text-sm text-muted-foreground">Season {{ data.season.number }}</p>
      </div>
    </header>

    <!-- Main Content -->
    <main class="relative z-10 flex-1 flex flex-col items-center justify-center overflow-hidden min-h-0">
      <div v-if="pending" class="flex flex-col items-center gap-4">
        <SpinLoader class="h-12 w-12" />
        <p>Loading Recap...</p>
      </div>
      <div v-else-if="error" class="text-destructive text-center">
        <p>Could not load the recap.</p>
        <p class="text-sm">{{ error.data?.message }}</p>
      </div>
      <div v-else-if="data && data.slides.length > 0" class="w-full h-full flex items-center justify-center">
        <div class="relative aspect-[9/16] h-full max-h-[calc(100vh-120px)]">
          <div class="w-full h-full story-container" ref="storyContainerRef">
            <div v-for="(slide, index) in data.slides" :key="slide.id" :ref="el => slideRefs[index] = el" class="story-slide">
              <RecapCanvas
                :model-value="JSON.stringify(slide.canvas_data)"
                :read-only="true"
              />
            </div>
          </div>
        </div>
      </div>
       <div v-else class="text-muted-foreground">
        This recap has no content yet.
      </div>
    </main>
    
    <!-- Navigation Controls -->
    <div v-if="data && data.slides.length > 1" class="absolute inset-y-0 left-0 flex items-center z-20">
      <Button @click="prevSlide" variant="ghost" class="h-full rounded-none px-4 sm:px-6 text-white/50 hover:text-white hover:bg-black/20 transition-all duration-300" :disabled="currentSlideIndex === 0">
        <ChevronLeftIcon class="h-8 w-8" />
      </Button>
    </div>
    <div v-if="data && data.slides.length > 1" class="absolute inset-y-0 right-0 flex items-center z-20">
      <Button @click="nextSlide" variant="ghost" class="h-full rounded-none px-4 sm:px-6 text-white/50 hover:text-white hover:bg-black/20 transition-all duration-300" :disabled="currentSlideIndex === data.slides.length - 1">
        <ChevronRightIcon class="h-8 w-8" />
      </Button>
    </div>

    <!-- Slide Counter -->
    <div v-if="data && data.slides.length > 0" class="absolute bottom-4 right-4 z-20 bg-background/50 text-foreground px-3 py-1 rounded-full text-sm">
      {{ currentSlideIndex + 1 }} / {{ data.slides.length }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
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

const storyContainerRef = ref<HTMLElement | null>(null);
const slideRefs = ref<Element[]>([]);
const currentSlideIndex = ref(0);
let observer: IntersectionObserver | null = null;

const scrollToSlide = (index: number) => {
  const container = storyContainerRef.value;
  if (container) {
    container.scrollTo({
      left: container.clientWidth * index,
      behavior: 'smooth',
    });
  }
};

const nextSlide = () => {
  if (data.value && currentSlideIndex.value < data.value.slides.length - 1) {
    scrollToSlide(currentSlideIndex.value + 1);
  }
};

const prevSlide = () => {
  if (currentSlideIndex.value > 0) {
    scrollToSlide(currentSlideIndex.value - 1);
  }
};

const initObserver = () => {
  if (observer) {
    observer.disconnect();
  }
  
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const index = slideRefs.value.findIndex(el => el === entry.target);
          if (index !== -1) {
            currentSlideIndex.value = index;
          }
        }
      });
    },
    { threshold: 0.5, root: storyContainerRef.value }
  );

  slideRefs.value.forEach(el => {
    if (el) observer?.observe(el)
  });
};

watch(data, () => {
  if (data.value) {
    nextTick(() => {
      initObserver();
    });
  }
});

onUnmounted(() => {
  observer?.disconnect();
});
</script>

<style>
.story-container {
  display: flex;
  overflow-x: scroll;
  scroll-snap-type: x mandatory;
  width: 100%;
  height: 100%;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none;  /* Internet Explorer 10+ */
}
.story-container::-webkit-scrollbar { /* WebKit */
  width: 0;
  height: 0;
}
.story-slide {
  flex: 0 0 100%;
  scroll-snap-align: start;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>