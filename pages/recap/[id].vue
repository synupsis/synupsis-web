<template>
  <div class="w-full h-screen bg-background text-foreground flex flex-col">
    <header v-if="data" class="flex items-center justify-between p-4 border-b border-border">
      <Button variant="ghost" @click="goBack">
        <ChevronLeftIcon class="h-4 w-4 mr-2" />
        Back to {{ data.show.name }}
      </Button>
      <div class="text-center">
        <h1 class="text-lg font-semibold">{{ data.show.name }}</h1>
        <p class="text-sm text-muted-foreground">Season {{ data.season.number }}</p>
      </div>
      <div class="w-32" /> <!-- Spacer -->
    </header>

    <main class="flex-1 flex items-center justify-center">
      <div v-if="pending" class="flex flex-col items-center gap-4">
        <SpinLoader class="h-12 w-12" />
        <p>Loading Recap...</p>
      </div>
      <div v-else-if="error" class="text-destructive text-center">
        <p>Could not load the recap.</p>
        <p class="text-sm">{{ error.data?.message }}</p>
      </div>
      <Carousel v-else-if="data" class="relative w-full max-w-lg mx-auto" @init-api="setApi">
        <CarouselContent>
          <CarouselItem v-for="(slide, index) in data.slides" :key="slide.id">
            <div class="p-1">
              <div class="w-[390px] h-[844px] bg-neutral rounded-3xl overflow-hidden shadow mx-auto">
                <RecapCanvas
                  :ref="el => (canvasRefs[index] = el)"
                  :model-value="JSON.stringify(slide.canvas_data)"
                  :read-only="true"
                />
              </div>
            </div>
          </CarouselItem>
        </CarouselContent>
        <CarouselPrevious class="absolute left-4 top-1/2 -translate-y-1/2" />
        <CarouselNext class="absolute right-4 top-1/2 -translate-y-1/2" />
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

const route = useRoute();
const router = useRouter();
const recapId = route.params.id as string;

const { data, pending, error } = useFetch(`/api/recap/${recapId}`, {
  lazy: true,
});

const goBack = () => {
  router.back();
};

// Logic for redrawing canvas on slide change
const api = ref<CarouselApi | null>(null);
const canvasRefs = ref<InstanceType<typeof RecapCanvas>[]>([]);

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
