<template>
  <div class="w-full h-dvh bg-background text-foreground flex flex-col">
    <header v-if="data" class="flex-shrink-0 flex items-center justify-between p-2 sm:p-4 border-b border-border">
      <Button variant="ghost" @click="goBack" class="w-auto">
        <ChevronLeftIcon class="h-4 w-4 sm:mr-2" />
        <span class="hidden sm:inline">Back to {{ data.show.name }}</span>
      </Button>
      <div class="flex items-center gap-4">
        <Button variant="secondary" @click="toggleRenderer">
          Use {{ rendererType === 'fabric' ? 'Konva' : 'Fabric' }}
        </Button>
        <div class="text-right">
          <h1 class="text-md sm:text-lg font-semibold">{{ data.show.name }}</h1>
          <p class="text-xs sm:text-sm text-muted-foreground">Season {{ data.season.number }}</p>
        </div>
      </div>
    </header>

    <main class="flex-1 flex items-center justify-center overflow-hidden min-h-0">
      <div v-if="pending" class="flex flex-col items-center gap-4">
        <SpinLoader class="h-12 w-12" />
        <p>Loading Recap...</p>
      </div>
      <div v-else-if="error" class="text-destructive text-center">
        <p>Could not load the recap.</p>
        <p class="text-sm">{{ error.data?.message }}</p>
      </div>
      <Carousel v-else-if="data" class="relative w-full h-full max-w-md mx-auto" @init-api="setApi">
        <CarouselContent class="h-full">
          <CarouselItem v-for="(slide, index) in data.slides" :key="slide.id" class="h-full">
            <div class="p-4 h-full flex items-center justify-center">
              <div class="relative aspect-[9/19.5] h-full bg-neutral rounded-3xl overflow-hidden shadow-lg mx-auto">
                <RecapCanvas
                  v-if="rendererType === 'fabric'"
                  :ref="el => (canvasRefs[index] = el)"
                  :model-value="JSON.stringify(slide.canvas_data)"
                  :read-only="true"
                />
                <RecapCanvasKonva
                  v-else
                  :ref="el => (canvasRefs[index] = el)"
                  :model-value="JSON.stringify(slide.canvas_data)"
                  :read-only="true"
                />
              </div>
            </div>
          </CarouselItem>
        </CarouselContent>
        <CarouselPrevious class="absolute left-2 sm:-left-12 top-1/2 -translate-y-1/2" />
        <CarouselNext class="absolute right-2 sm:-right-12 top-1/2 -translate-y-1/2" />
      </Carousel>
    </main>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '~/components/shadcn/carousel'
import { Button } from '~/components/shadcn/button'
import { ChevronLeftIcon } from '@heroicons/vue/24/outline'
import SpinLoader from '~/components/ui/SpinLoader.vue';
import RecapCanvas from '~/components/RecapCanvas.vue';
import RecapCanvasKonva from '~/components/RecapCanvasKonva.client.vue';

const route = useRoute();
const router = useRouter();
const recapId = route.params.id as string;

const rendererType = ref<'fabric' | 'konva'>('konva');
const toggleRenderer = () => {
  rendererType.value = rendererType.value === 'fabric' ? 'konva' : 'fabric';
};

const { data, pending, error } = useFetch(`/api/recap/${recapId}`, {
  lazy: true,
});

const goBack = () => {
  router.back();
};

// Logic for redrawing canvas on slide change
const api = ref<CarouselApi | null>(null);
const canvasRefs = ref<(InstanceType<typeof RecapCanvas> | InstanceType<typeof RecapCanvasKonva>)[]>([]);

function setApi(val: CarouselApi) {
  api.value = val;
}

watch(api, (newApi) => {
  if (!newApi) return;

  newApi.on('select', () => {
    const currentSlideIndex = newApi.selectedScrollSnap();
    const canvasToRedraw = canvasRefs.value[currentSlideIndex];
    if (canvasToRedraw) {
      canvasToRedraw.redraw();
    }
  });
  
  // Initial draw for the first slide
  setTimeout(() => {
    if (canvasRefs.value[0]) {
      canvasRefs.value[0].redraw();
    }
  }, 100);
});
</script>
