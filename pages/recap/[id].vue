<template>
  <div v-if="pending" class="w-screen h-dvh bg-background text-foreground flex flex-col items-center justify-center gap-4">
    <SpinLoader class="h-12 w-12" />
    <p>Loading Recap...</p>
  </div>
  <div v-else-if="error" class="w-screen h-dvh bg-background text-foreground flex flex-col items-center justify-center gap-4">
    <p class="text-destructive">Could not load the recap.</p>
    <p class="text-sm">{{ errorMessage }}</p>
    <Button @click="goBack">Go Back</Button>
  </div>
  <div
    v-else-if="data && currentSlide"
    class="w-screen h-dvh bg-black text-white flex flex-col relative overflow-hidden select-none"
    @mousedown="pauseStory"
    @mouseup="resumeStory"
    @touchstart.passive="pauseStory"
    @touchend.passive="resumeStory"
  >
    <!-- Progress Bars -->
    <div class="absolute top-2 left-2 right-2 z-20 flex gap-1">
      <div v-for="(_, index) in data.slides" :key="index" class="h-1 bg-white/30 flex-1 rounded-full overflow-hidden">
        <div
          class="h-full bg-white transition-transform duration-100 origin-left"
          :style="{ transform: `scaleX(${getProgressBarValue(index)})` }"
        />
      </div>
    </div>

    <!-- Header -->
    <header class="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div>
          <h1 class="text-lg font-bold">{{ data.show.name }}</h1>
          <p class="text-sm text-white/80">Season {{ data.season.number }}</p>
        </div>
      </div>
      <Button variant="ghost" size="icon" @click="goBack" class="bg-black/20 hover:bg-black/40">
        <XMarkIcon class="h-6 w-6" />
      </Button>
    </header>

    <!-- Story Content -->
    <div class="relative w-full h-full">
      <!-- Background Image with Ken Burns Effect -->
      <Transition name="fade" mode="out-in">
        <CachedImage
          v-if="currentSlide.image_url"
          :key="currentSlide.id"
          :src="currentSlide.image_url"
          alt="Slide background"
          class="absolute inset-0 w-full h-full object-cover animate-kenburns"
        />
      </Transition>
      <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

      <!-- Canvas Data -->
      <div class="absolute inset-0 flex items-center justify-center">
        <ClientOnly>
          <RecapCanvas
            :key="currentSlide.id"
            :model-value="JSON.stringify(currentSlide.canvas_data)"
            :read-only="true"
            class="w-full h-full animate-fade-in-up"
          />
        </ClientOnly>
      </div>
    </div>

    <!-- Navigation Areas -->
    <div class="absolute top-0 left-0 h-full w-1/3 z-10" @click="prevSlide" />
    <div class="absolute top-0 right-0 h-full w-1/3 z-10" @click="nextSlide()" />
  </div>
  <div v-else class="w-screen h-dvh bg-background text-foreground flex flex-col items-center justify-center gap-4">
    <p class="text-muted-foreground">This recap has no content yet.</p>
    <Button @click="goBack">Go Back</Button>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { Button } from '~/components/shadcn/button';
import { XMarkIcon } from '@heroicons/vue/24/outline';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import RecapCanvas from '~/components/RecapCanvas.client.vue';
import CachedImage from '~/components/CachedImage.vue';
import type { Json } from '~/types/database.types';

type RecapResponse = {
  id: string;
  status: string;
  show: { name: string; trakt_id: number };
  season: { number: number; image: string | null };
  slides: Array<{
    id: string;
    order: number;
    canvas_data: Json | null;
    image_url?: string | null;
  }>;
};

const SLIDE_DURATION = 7000; // 7 seconds per slide

const route = useRoute();
const router = useRouter();
const recapId = route.params.id as string;

const { data, pending, error } = useFetch<RecapResponse>(`/api/recap/${recapId}`, {
  lazy: true,
});

const currentSlideIndex = ref(0);
const progress = ref(0);
const isPaused = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const errorMessage = computed(() => {
  const payload = error.value?.data as { message?: string; statusMessage?: string } | undefined;
  return payload?.message ?? payload?.statusMessage ?? error.value?.message ?? '';
});

const currentSlide = computed(() => {
  if (!data.value || !data.value.slides) return null;
  return data.value.slides[currentSlideIndex.value];
});

const goBack = () => {
  if (data.value?.show?.trakt_id) {
    router.push(`/shows/${data.value.show.trakt_id}`);
  } else {
    router.back();
  }
};

const startTimer = () => {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (!isPaused.value) {
      progress.value += (100 / (SLIDE_DURATION / 100));
      if (progress.value >= 100) {
        nextSlide(true); // Move to next slide automatically
      }
    }
  }, 100);
};

const resetTimer = () => {
  progress.value = 0;
  startTimer();
};

const nextSlide = (isAutomatic = false) => {
  if (!data.value) return;
  if (currentSlideIndex.value < data.value.slides.length - 1) {
    currentSlideIndex.value++;
    resetTimer();
  } else if (isAutomatic) {
    goBack(); // Go back if it was the last slide and it finished automatically
  }
};

const prevSlide = () => {
  if (currentSlideIndex.value > 0) {
    currentSlideIndex.value--;
    resetTimer();
  }
};

const pauseStory = () => {
  isPaused.value = true;
};

const resumeStory = () => {
  isPaused.value = false;
};

const getProgressBarValue = (index: number) => {
  if (index < currentSlideIndex.value) return 1;
  if (index > currentSlideIndex.value) return 0;
  return progress.value / 100;
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowRight') nextSlide();
  if (e.key === 'ArrowLeft') prevSlide();
  if (e.key === 'Escape') goBack();
};

onMounted(() => {
  if (data.value && data.value.slides.length > 0) {
    startTimer();
  }
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  window.removeEventListener('keydown', handleKeydown);
});

watch(data, (newData) => {
  if (newData && newData.slides.length > 0) {
    currentSlideIndex.value = 0;
    resetTimer();
  }
});
</script>

<style scoped>
@keyframes kenburns {
  0% {
    transform: scale(1) translate(0, 0);
    opacity: 0.7;
  }
  100% {
    transform: scale(1.1) translate(-1%, 1%);
    opacity: 1;
  }
}

.animate-kenburns {
  animation: kenburns 7s ease-in-out infinite alternate-reverse both;
}

.animate-fade-in-up {
  animation: fadeInUp 0.5s ease-out forwards;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
