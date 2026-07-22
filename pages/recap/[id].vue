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
    class="fixed inset-0 z-40 flex h-dvh w-screen select-none flex-col overflow-hidden bg-black text-white"
    @mousedown="pauseStory"
    @mouseup="resumeStory"
    @touchstart.passive="pauseStory"
    @touchend.passive="resumeStory"
  >
    <Transition name="fade" mode="out-in">
      <img
        v-if="currentSlide.image_url"
        :key="`ambient-${currentSlide.id}`"
        :src="currentSlide.image_url"
        alt=""
        aria-hidden="true"
        class="pointer-events-none absolute -inset-8 h-[calc(100%+4rem)] w-[calc(100%+4rem)] scale-110 object-cover opacity-30 blur-3xl"
      >
    </Transition>
    <div class="pointer-events-none absolute inset-0 bg-black/65" />

    <!-- Progress Bars -->
    <div
      class="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top)_+_0.55rem)] z-30 flex w-[calc(100%_-_1rem)] max-w-[360px] -translate-x-1/2 gap-1 px-1"
      role="progressbar"
      aria-valuemin="1"
      :aria-valuemax="data.slides.length"
      :aria-valuenow="currentSlideIndex + 1"
      :aria-valuetext="`Slide ${currentSlideIndex + 1} sur ${data.slides.length}`"
    >
      <div
        v-for="(slide, index) in data.slides"
        :key="slide.id"
        class="h-1 flex-1 overflow-hidden rounded-full bg-white/40 data-[state=current]:bg-white/60"
        :data-state="getProgressBarState(index)"
        aria-hidden="true"
      >
        <div
          class="h-full bg-white transition-transform duration-100 origin-left"
          :style="{ transform: `scaleX(${getProgressBarValue(index)})` }"
        />
      </div>
    </div>

    <!-- Header -->
    <header
      class="absolute left-1/2 top-[calc(env(safe-area-inset-top)_+_1.15rem)] z-30 flex w-full max-w-[360px] -translate-x-1/2 items-center justify-between px-3"
    >
      <div class="flex items-center gap-3 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 backdrop-blur-md">
        <div>
          <h1 class="text-sm font-semibold leading-tight">{{ data.show.name }}</h1>
          <p class="text-[10px] uppercase tracking-[0.16em] text-white/60">Saison {{ data.season.number }}</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          class="rounded-full border border-white/10 bg-black/25 backdrop-blur-md hover:bg-black/45"
          aria-label="Voir les sources"
          @click.stop="openSources"
        >
          <InformationCircleIcon class="h-6 w-6" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Fermer le recap"
          class="rounded-full border border-white/10 bg-black/25 backdrop-blur-md hover:bg-black/45"
          @click="goBack"
        >
          <XMarkIcon class="h-6 w-6" />
        </Button>
      </div>
    </header>

    <!-- Story Content -->
    <div class="relative flex h-full w-full items-center justify-center">
      <div class="relative h-full w-full max-w-full overflow-hidden shadow-2xl sm:aspect-[390/844] sm:w-auto sm:rounded-[30px] sm:ring-1 sm:ring-white/10">
        <RecapStorySlide
          v-if="currentSlide.content"
          :key="currentSlide.id"
          :content="currentSlide.content"
          :image-url="currentSlide.image_url || null"
          :season-number="data.season.number"
          :slide-number="currentSlideIndex + 1"
          :total-slides="data.slides.length"
          :genres="data.show.genres"
          class="animate-fade-in-up"
        />
        <ClientOnly v-else>
          <RecapCanvas
            :key="currentSlide.id"
            :model-value="JSON.stringify(currentSlide.canvas_data)"
            :read-only="true"
            class="h-full w-full animate-fade-in-up"
          />
        </ClientOnly>
      </div>
    </div>

    <!-- Navigation Areas -->
    <div class="absolute top-0 left-0 h-full w-1/3 z-10" @click="prevSlide" />
    <div class="absolute top-0 right-0 h-full w-1/3 z-10" @click="nextSlide()" />

    <div
      v-if="isSourcesOpen"
      class="absolute inset-0 z-30 flex items-end bg-black/60 p-3 sm:items-center sm:justify-center"
      @mousedown.stop
      @mouseup.stop
      @touchstart.stop
      @touchend.stop
      @click.self="closeSources"
    >
      <section class="max-h-[70dvh] w-full overflow-y-auto rounded-2xl bg-background p-5 text-foreground shadow-2xl sm:max-w-md">
        <div class="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 class="text-lg font-semibold">Sources de cette slide</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              Le texte généré reformule uniquement les fragments référencés ci-dessous.
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Fermer les sources" @click="closeSources">
            <XMarkIcon class="h-5 w-5" />
          </Button>
        </div>

        <div v-if="currentEvents.length" class="mb-4 rounded-xl border bg-muted/40 p-3">
          <p class="text-sm font-medium">Événements utilisés</p>
          <ul class="mt-2 space-y-2">
            <li v-for="storyEvent in currentEvents" :key="storyEvent.id" class="text-sm">
              <span>{{ storyEvent.title }}</span>
              <span class="ml-2 text-xs text-muted-foreground">
                confiance {{ Math.round(storyEvent.confidence * 100) }} %
              </span>
            </li>
          </ul>
        </div>

        <ul v-if="currentSources.length" class="space-y-3">
          <li v-for="source in currentSources" :key="source.key" class="rounded-xl border p-3">
            <p class="font-medium">{{ source.provider }}</p>
            <p v-if="source.episodeNumber" class="text-sm text-muted-foreground">
              Épisode {{ source.episodeNumber }} · {{ source.locale.toUpperCase() }}
            </p>
            <a
              v-if="source.sourceUrl"
              :href="source.sourceUrl"
              target="_blank"
              rel="noreferrer"
              class="mt-2 inline-block text-sm text-primary underline underline-offset-4"
            >
              Consulter la source
            </a>
            <p v-if="source.revisionId" class="mt-2 text-xs text-muted-foreground">
              Révision {{ source.revisionId }}
            </p>
            <p class="mt-2 text-xs text-muted-foreground">
              Licence :
              <a
                v-if="source.licenseUrl"
                :href="source.licenseUrl"
                target="_blank"
                rel="noreferrer"
                class="underline underline-offset-2"
              >
                {{ source.licenseName }}
              </a>
              <span v-else>{{ source.licenseName }}</span>
            </p>
          </li>
        </ul>
        <p v-else class="text-sm text-muted-foreground">Aucune source publique n'est liée à cette slide.</p>

        <p v-if="data.sourceRights?.warnings?.length" class="mt-4 text-xs text-muted-foreground">
          Certaines sources restent soumises aux conditions de leur fournisseur. Leur statut est suivi dans le
          registre de droits Synupsis.
        </p>
      </section>
    </div>
  </div>
  <div v-else class="w-screen h-dvh bg-background text-foreground flex flex-col items-center justify-center gap-4">
    <p class="text-muted-foreground">This recap has no content yet.</p>
    <Button @click="goBack">Go Back</Button>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { Button } from '~/components/shadcn/button';
import { InformationCircleIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import RecapCanvas from '~/components/RecapCanvas.client.vue';
import RecapStorySlide from '~/components/RecapStorySlide.vue';
import type { Json } from '~/types/database.types';

type SlideContent = {
  kind: 'cover';
  title: string;
  subtitle: string;
  logline: string;
  episodeCount: number;
} | {
  kind: 'beat';
  headline: string;
  narration: string;
  tag: string;
  episodeNumbers: number[];
};

type RecapResponse = {
  id: string;
  status: string;
  show: { name: string; trakt_id: number; genres: string[] };
  season: { number: number; image: string | null };
  slides: Array<{
    id: string;
    order: number;
    canvas_data: Json | null;
    image_url?: string | null;
    content: SlideContent | null;
    events: Array<{
      id: string;
      title: string;
      confidence: number;
    }>;
    evidence: Array<{
      id: string;
      episodeNumber: number | null;
      locale: string;
      provider: string;
      sourceUrl: string | null;
      revisionId: string | null;
      licenseName: string;
      licenseUrl: string | null;
    }>;
  }>;
  sourceProviders: Array<{
    id: string;
    label: string;
    sourceUrl: string | null;
    termsUrl: string | null;
    licenseName: string;
    licenseUrl: string | null;
    commercialUse: string;
    attributionRequired: boolean;
  }>;
  sourceRights: {
    registryVersion?: string;
    mode?: string;
    ready?: boolean;
    approvedProviderIds?: string[];
    warnings?: string[];
  } | null;
  qualityReport: Json | null;
};

const DEFAULT_SLIDE_DURATION = 8000;

const route = useRoute();
const router = useRouter();
const recapId = route.params.id as string;

const { data, pending, error } = useFetch<RecapResponse>(`/api/recap/${recapId}`, {
  lazy: true,
});

const currentSlideIndex = ref(0);
const progress = ref(0);
const isPaused = ref(false);
const isSourcesOpen = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const errorMessage = computed(() => {
  const payload = error.value?.data as { message?: string; statusMessage?: string } | undefined;
  return payload?.message ?? payload?.statusMessage ?? error.value?.message ?? '';
});

const currentSlide = computed(() => {
  if (!data.value || !data.value.slides) return null;
  return data.value.slides[currentSlideIndex.value];
});

const currentEvents = computed(() => currentSlide.value?.events || []);

const currentSources = computed(() => {
  const evidence = currentSlide.value?.evidence || [];
  if (evidence.length) {
    return evidence.map(item => ({ ...item, key: item.id }));
  }
  return (data.value?.sourceProviders || []).map(provider => ({
    key: provider.id,
    provider: provider.label,
    episodeNumber: null,
    locale: 'und',
    sourceUrl: provider.sourceUrl,
    revisionId: null,
    licenseName: provider.licenseName,
    licenseUrl: provider.licenseUrl,
  }));
});

const currentSlideDuration = computed(() => {
  const canvasData = currentSlide.value?.canvas_data;
  if (!canvasData || typeof canvasData !== 'object' || Array.isArray(canvasData)) {
    return DEFAULT_SLIDE_DURATION;
  }
  const attrs = 'attrs' in canvasData ? canvasData.attrs : null;
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs) || !('durationMs' in attrs)) {
    return DEFAULT_SLIDE_DURATION;
  }
  const duration = Number(attrs.durationMs);
  return Number.isFinite(duration) ? Math.min(24_000, Math.max(6_000, duration)) : DEFAULT_SLIDE_DURATION;
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
      progress.value += (100 / (currentSlideDuration.value / 100));
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

const openSources = () => {
  isSourcesOpen.value = true;
  pauseStory();
};

const closeSources = () => {
  isSourcesOpen.value = false;
  resumeStory();
};

const getProgressBarValue = (index: number) => {
  if (index < currentSlideIndex.value) return 1;
  if (index > currentSlideIndex.value) return 0;
  return Math.min(1, Math.max(0, progress.value / 100));
};

const getProgressBarState = (index: number) => {
  if (index < currentSlideIndex.value) return 'completed';
  if (index > currentSlideIndex.value) return 'remaining';
  return 'current';
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
