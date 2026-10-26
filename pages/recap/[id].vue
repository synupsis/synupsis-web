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
    class="fixed inset-0 z-40 flex h-dvh w-screen select-none flex-col overflow-clip bg-black text-white"
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

    <!-- Story Content -->
    <div class="relative flex h-full w-full items-center justify-center">
      <div class="relative h-full w-full max-w-full overflow-hidden shadow-2xl sm:aspect-[390/844] sm:w-auto sm:rounded-[30px] sm:ring-1 sm:ring-white/10">
        <!-- Progress Bars and header follow the story frame width -->
        <div
          class="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)_+_0.55rem)] z-30 flex gap-1 px-3"
          role="progressbar"
          aria-valuemin="1"
          :aria-valuemax="progressIndexes.length"
          :aria-valuenow="progressIndexes.indexOf(currentSlideIndex) + 1"
          :aria-valuetext="progressLabel"
        >
          <div
            v-for="index in progressIndexes"
            :key="data.slides[index]?.id ?? index"
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

        <!-- A soft scrim keeps the bar and the header readable over any image -->
        <div class="pointer-events-none absolute inset-x-0 top-0 z-20 h-28 bg-gradient-to-b from-black/55 via-black/20 to-transparent" />

        <!-- Header -->
        <header
          class="absolute inset-x-0 top-[calc(env(safe-area-inset-top)_+_1.1rem)] z-30 flex items-center justify-between gap-3 pl-4 pr-2"
        >
          <div class="flex min-w-0 items-center gap-2.5 [text-shadow:0_1px_8px_rgb(0_0_0/0.45)]">
            <img
              v-if="data.season.image && !isPosterBroken"
              :src="data.season.image"
              alt=""
              class="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-white/20"
              @error="isPosterBroken = true"
            >
            <div class="min-w-0">
              <h1 class="truncate text-[15px] font-semibold leading-5">{{ data.show.name }}</h1>
              <p class="truncate text-xs leading-4 text-white/75">{{ headerContext }}</p>
            </div>
          </div>
          <div class="flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon"
              class="h-10 w-10 rounded-full text-white hover:bg-white/10 hover:text-white"
              aria-label="Voir les sources"
              @click.stop="openSources"
            >
              <InformationCircleIcon class="h-6 w-6 drop-shadow" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Fermer le recap"
              class="h-10 w-10 rounded-full text-white hover:bg-white/10 hover:text-white"
              @click="goBack"
            >
              <XMarkIcon class="h-6 w-6 drop-shadow" />
            </Button>
          </div>
        </header>

        <RecapStorySlide
          v-if="currentSlide.content"
          :key="currentSlide.id"
          :content="currentSlide.content"
          :image-url="currentSlide.image_url || null"
          :image-focus="currentSlide.image_focus ?? null"
          :season-number="data.season.number"
          :slide-number="currentSlideIndex + 1"
          :total-slides="data.slides.length"
          :genres="data.show.genres"
          :has-rail="isChapterStory"
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

        <!-- Chapters: skip an episode, or jump to another one -->
        <div
          v-if="isChapterStory"
          class="pointer-events-none absolute inset-x-0 bottom-0 z-30"
          @mousedown.stop
          @mouseup.stop
          @touchstart.stop
          @touchend.stop
        >
          <div v-if="currentSlide.content?.kind === 'chapter'" class="flex justify-end px-6 pb-3 sm:px-7">
            <button
              type="button"
              class="pointer-events-auto inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/10"
              @click="skipChapter"
            >
              Je m’en souviens
              <ForwardIcon class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <nav
            ref="railElement"
            aria-label="Épisodes"
            class="pointer-events-auto overflow-x-auto border-t border-white/10 bg-black/85 px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md [scrollbar-width:none]"
          >
            <div class="relative flex w-max min-w-full items-center justify-between gap-1">
              <!-- The season line fills up to the current episode -->
              <div class="pointer-events-none absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-white/10" aria-hidden="true">
                <div class="h-full rounded-full bg-white/50 transition-[width] duration-500 ease-out" :style="{ width: railProgress }" />
              </div>
              <button
                v-for="chapter in railChapters"
                :key="chapter.key"
                type="button"
                class="relative flex h-11 shrink-0 items-center justify-center"
                :aria-label="chapter.ariaLabel"
                :aria-current="chapter.state === 'current' ? 'step' : undefined"
                @click="jumpTo(chapter.firstIndex)"
              >
                <span
                  class="flex h-7 min-w-7 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums transition-all duration-300"
                  :class="chapter.state === 'current'
                    ? 'bg-white px-2.5 text-neutral-900 shadow-[0_0_0_4px_rgb(0_0_0/0.85),0_0_18px_rgb(255_255_255/0.25)]'
                    : chapter.state === 'read'
                      ? 'bg-neutral-800 text-white/55'
                      : 'bg-neutral-950 text-white ring-1 ring-inset ring-white/20'"
                >
                  {{ chapter.state === 'current' && chapter.key !== 'end' ? `Ép. ${chapter.label}` : chapter.label }}
                </span>
              </button>
            </div>
          </nav>
        </div>
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

        <p v-if="isChapterStory" class="mt-4 text-xs text-muted-foreground">
          Images : Trakt et TMDB. Portraits et casting enrichis par TVMaze (CC BY-SA).
        </p>
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
import { ForwardIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import RecapCanvas from '~/components/RecapCanvas.client.vue';
import RecapStorySlide from '~/components/RecapStorySlide.vue';
import type { Json } from '~/types/database.types';
import type { RecapStorySlideContent } from '~/types/recap-story.types';

type SlideContent = RecapStorySlideContent;

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
    image_focus?: { x: number; y: number } | null;
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
const isPosterBroken = ref(false);
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

// Format version 10 tells the season chapter by chapter: one per episode, then the end.
const CHAPTER_KINDS = new Set(['chapter', 'moment', 'moment-group', 'changes', 'ending-status', 'ending-deaths', 'ending-questions']);

type Chapter = { key: string; label: string; ariaLabel: string; indexes: number[] };

function chapterOf(content: SlideContent | null): { key: string; label: string; ariaLabel: string } {
  if (!content || content.kind === 'cover') return { key: 'cover', label: '', ariaLabel: 'Couverture' };
  if (content.kind === 'ending-status' || content.kind === 'ending-deaths' || content.kind === 'ending-questions') {
    return { key: 'end', label: 'Fin', ariaLabel: 'Fin de saison' };
  }
  if (content.kind === 'beat') return { key: 'beats', label: '', ariaLabel: 'L’essentiel' };
  return { key: `episode-${content.episodeNumber}`, label: String(content.episodeNumber), ariaLabel: `Épisode ${content.episodeNumber}` };
}

const isChapterStory = computed(() => (data.value?.slides || []).some(slide => slide.content && CHAPTER_KINDS.has(slide.content.kind)));

const chapters = computed<Chapter[]>(() => {
  const list: Chapter[] = [];
  (data.value?.slides || []).forEach((slide, index) => {
    const chapter = chapterOf(slide.content);
    const last = list[list.length - 1];
    if (last?.key === chapter.key) last.indexes.push(index);
    else list.push({ ...chapter, indexes: [index] });
  });
  return list;
});

const currentChapter = computed(() => chapters.value.find(chapter => chapter.indexes.includes(currentSlideIndex.value)) ?? null);

// The top bar shows the slides of the current chapter; older recaps show every slide.
const progressIndexes = computed(() => (
  isChapterStory.value && currentChapter.value
    ? currentChapter.value.indexes
    : (data.value?.slides || []).map((_, index) => index)
));

const progressLabel = computed(() => {
  const position = progressIndexes.value.indexOf(currentSlideIndex.value) + 1;
  const label = isChapterStory.value && currentChapter.value?.key !== 'cover' ? `${currentChapter.value?.ariaLabel} · ` : '';
  return `${label}Slide ${position} sur ${progressIndexes.value.length}`;
});

// Under the show name: the season, and the chapter the top bar is counting.
const headerContext = computed(() => {
  const season = `Saison ${data.value?.season.number ?? ''}`;
  const key = isChapterStory.value ? currentChapter.value?.key : null;
  if (key === 'end') return `${season} · Fin de saison`;
  if (key?.startsWith('episode-')) return `${season} · ${currentChapter.value?.ariaLabel}`;
  return season;
});

const railChapters = computed(() => chapters.value
  .filter(chapter => chapter.label)
  .map((chapter) => {
    const firstIndex = chapter.indexes[0] ?? 0;
    const lastIndex = chapter.indexes[chapter.indexes.length - 1] ?? 0;
    const state = chapter.indexes.includes(currentSlideIndex.value)
      ? 'current'
      : lastIndex < currentSlideIndex.value ? 'read' : 'upcoming';
    return { ...chapter, firstIndex, state };
  }));

// How far the season line is filled: up to the current episode node.
const railProgress = computed(() => {
  const current = railChapters.value.findIndex(chapter => chapter.state === 'current');
  if (current < 0 || railChapters.value.length < 2) return '0%';
  return `${(current / (railChapters.value.length - 1)) * 100}%`;
});

// Long seasons scroll the rail: keep the current episode in view. Scrolling the
// rail itself avoids scrollIntoView, which would also scroll the player.
const railElement = ref<HTMLElement | null>(null);
watch(() => currentChapter.value?.key, async () => {
  await nextTick();
  const rail = railElement.value;
  const current = rail?.querySelector<HTMLElement>('[aria-current="step"]');
  if (!rail || !current) return;
  rail.scrollTo({ left: current.offsetLeft - (rail.clientWidth - current.offsetWidth) / 2, behavior: 'smooth' });
});

const jumpTo = (index: number) => {
  if (!data.value || index < 0 || index >= data.value.slides.length) return;
  currentSlideIndex.value = index;
  resetTimer();
};

// "Je m'en souviens": straight to the episode's bilan, or to the next chapter without one.
const skipChapter = () => {
  const chapter = currentChapter.value;
  if (!chapter || !data.value) return;
  const bilanIndex = chapter.indexes.find(index => index > currentSlideIndex.value && data.value?.slides[index]?.content?.kind === 'changes');
  const lastIndex = chapter.indexes[chapter.indexes.length - 1] ?? currentSlideIndex.value;
  jumpTo(bilanIndex ?? Math.min(lastIndex + 1, data.value.slides.length - 1));
};

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
