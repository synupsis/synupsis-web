<template>
  <ClientOnly>
    <div class="h-screen w-full flex flex-col bg-background text-foreground">
      <!-- Header -->
      <header class="flex items-center justify-between p-4 border-b border-border">
        <div class="flex items-center gap-4">
          <Logo size="sm" />
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-lg font-semibold">Recap Editor</h1>
              <Badge v-if="recapStatus" :variant="recapStatus === 'published' ? 'default' : 'secondary'">
                {{ recapStatus }}
              </Badge>
              <Badge v-if="isCanonical" variant="outline">Canonical</Badge>
              <Badge v-if="isVerificationStale" variant="destructive">Verification outdated</Badge>
            </div>
            <p v-if="!loading" class="text-sm text-muted-foreground">
              {{ showName }} - Season {{ seasonNumber }}
            </p>
            <div v-else class="h-4 bg-muted-foreground/20 rounded-md w-48 animate-pulse" />
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="ghost" class="min-w-[90px]" @click="goBack">Cancel</Button>
          <Button variant="outline" class="min-w-[130px]" :disabled="loading || isSaving || !isDirty" @click="saveDraft">
            <span v-if="isSaving" class="loading loading-spinner h-4 w-4" />
            <CheckCircleIcon v-else-if="!isDirty" class="h-4 w-4 text-green-500 mr-2" />
            <DocumentArrowDownIcon v-else class="h-4 w-4 mr-2" />
            <span>
              <template v-if="isSaving">Saving...</template>
              <template v-else-if="!isDirty">Saved</template>
              <template v-else>{{ recapStatus === 'published' ? 'Save' : 'Save Draft' }}</template>
            </span>
          </Button>
          <Button v-if="recapStatus !== 'published'" class="min-w-[130px]" :disabled="loading || isPublishing" @click="publishRecap">
            <span v-if="isPublishing" class="loading loading-spinner h-4 w-4" />
            <ArrowUpCircleIcon v-else class="h-4 w-4 mr-2" />
            <span>{{ isPublishing ? 'Publishing...' : 'Publish' }}</span>
          </Button>
          <Button v-if="recapStatus === 'published' && existingRecapId" variant="outline" as-child>
            <router-link :to="`/recap/${existingRecapId}`">
              <EyeIcon class="h-4 w-4 mr-2" />
              View
            </router-link>
          </Button>
          <Button variant="outline" @click="copyJsonToClipboard">
            <DocumentDuplicateIcon class="h-4 w-4 mr-2" />
            Copy JSON
          </Button>
        </div>
      </header>

      <!-- Wrapper to prevent hydration mismatch -->
      <div v-if="!loading" class="flex flex-1 overflow-hidden">
        <!-- Slides Sorter (Left) -->
        <aside class="w-64 p-4 border-r border-border flex flex-col gap-4 overflow-y-auto">
          <h2 class="text-xl font-semibold tracking-tight">Slides</h2>
          <draggable v-model="slides" item-key="id" class="space-y-2" :disabled="hasSemanticStory">
            <template #item="{ element: slide, index }">
              <div
                class="relative group"
                @click="selectedSlideId = slide.id"
              >
                <button
                  :class="[
                    'w-full p-4 rounded-lg border-2 text-left',
                    selectedSlideId === slide.id
                      ? 'border-primary'
                      : 'border-border hover:border-primary/50',
                  ]"
                >
                  <p class="truncate font-bold">{{ getSlideLabel(index) }}</p>
                  <p class="mt-1 text-xs text-muted-foreground">
                    {{ index === 0 && hasSemanticStory ? 'Couverture' : `Slide ${index + 1}` }}
                  </p>
                </button>
                <button
                  v-if="!hasSemanticStory"
                  class="absolute top-2 right-2 p-1 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  @click.stop="removeSlide(slide)"
                >
                  <TrashIcon class="h-4 w-4" />
                </button>
              </div>
            </template>
          </draggable>
          <div v-if="hasSemanticStory" class="rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
            La structure générée est verrouillée pour garder les textes, les sources et les images synchronisés.
          </div>
          <div class="mt-auto space-y-2">
            <Button v-if="!hasSemanticStory" variant="outline" class="w-full" @click="addSlide">
              <SquaresPlusIcon class="h-4 w-4 mr-2" />
              Add Slide
            </Button>
            <AlertDialog>
              <AlertDialogTrigger as-child>
                <Button v-if="existingRecapId" variant="destructive" class="w-full">
                  <TrashIcon class="h-4 w-4 mr-2" />
                  Delete Recap
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your recap
                    and remove your data from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction @click="deleteRecap">
                    <span v-if="isDeleting" class="loading loading-spinner h-4 w-4" />
                    <span v-else>Continue</span>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </aside>

        <!-- Main Preview (Center) -->
        <main class="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/20 p-4 sm:p-6">
          <div v-if="error" class="text-destructive">
            <p>{{ error.message }}</p>
            <Button class="mt-2" @click="goBack">Go Back</Button>
          </div>
          <template v-else>
            <div v-if="hasSemanticStory" class="mb-4 flex items-center justify-center gap-1 rounded-xl border bg-background/80 p-1 shadow-sm self-center">
              <Button
                size="sm"
                :variant="editorMode === 'story' ? 'default' : 'ghost'"
                @click="editorMode = 'story'"
              >
                <DocumentTextIcon class="mr-2 h-4 w-4" />
                Story preview
              </Button>
              <Button
                size="sm"
                :variant="editorMode === 'visual' ? 'default' : 'ghost'"
                @click="editorMode = 'visual'"
              >
                <PhotoIcon class="mr-2 h-4 w-4" />
                Image
              </Button>
            </div>

            <div class="flex min-h-0 flex-1 items-center justify-center">
              <div class="relative aspect-[9/19.5] h-full max-w-full overflow-hidden rounded-3xl bg-background shadow-xl ring-1 ring-black/5">
                <RecapStorySlide
                  v-if="hasSemanticStory && editorMode === 'story' && activeStoryContent"
                  :content="activeStoryContent"
                  :image-url="activeSlideImageUrl"
                  :season-number="seasonNumber || 0"
                  :slide-number="selectedSlideIndex + 1"
                  :total-slides="slides.length"
                  :genres="pageData?.show.genres || []"
                />
                <RecapCanvas
                  v-else
                  :key="selectedSlideId ?? 'no-slide'"
                  v-model="activeSlideCanvas"
                  :loading="loading"
                  :season-id="seasonId"
                  :selected-element-id="selectedElement?.id"
                  :visual-only="hasSemanticStory"
                  @select-element="handleSelectElement"
                />
              </div>
            </div>

            <p v-if="hasSemanticStory && editorMode === 'visual'" class="mt-3 text-center text-xs text-muted-foreground">
              Ici, seule l’image de fond est éditée. Les textes se modifient dans « Story preview ».
            </p>
          </template>
        </main>

        <!-- Inspector Panel (Right) -->
        <RecapStoryInspector
          v-if="hasSemanticStory && editorMode === 'story' && activeStoryContent"
          :content="activeStoryContent"
          @update="handleUpdateStoryContent"
        />
        <InspectorPanel
          v-else
          :selected-element="selectedElement"
          :elements="currentSlideElements"
          @update="handleUpdateElement"
          @select-by-id="handleSelectElementById"
          @deselect="selectedElement = null"
        />
      </div>
      <!-- Loading Skeleton -->
      <div v-else class="flex flex-1 overflow-hidden">
        <aside class="w-64 p-4 border-r border-border flex flex-col gap-4">
          <div class="h-8 w-24 bg-muted/40 rounded-md animate-pulse" />
          <div class="h-20 w-full bg-muted/40 rounded-md animate-pulse" />
          <div class="h-20 w-full bg-muted/40 rounded-md animate-pulse" />
          <div class="mt-auto h-10 w-full bg-muted/40 rounded-md animate-pulse" />
        </aside>
        <main class="flex-1 flex items-center justify-center p-8 bg-muted/20">
          <div class="relative aspect-[9/19.5] h-full max-w-full bg-background/40 rounded-3xl animate-pulse" />
        </main>
      </div>
    </div>

    <template #fallback>
      <!-- Full page skeleton -->
      <div class="h-screen w-full flex flex-col bg-background text-foreground">
        <header class="flex items-center justify-between p-4 border-b border-border">
          <div class="flex items-center gap-4">
            <div class="h-8 w-8 bg-muted/40 rounded-full animate-pulse" />
            <div>
              <div class="h-6 w-32 bg-muted/40 rounded-md animate-pulse" />
              <div class="h-4 mt-1 w-48 bg-muted/40 rounded-md animate-pulse" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div class="h-9 w-24 bg-muted/40 rounded-md animate-pulse" />
            <div class="h-9 w-32 bg-muted/40 rounded-md animate-pulse" />
            <div class="h-9 w-32 bg-muted/40 rounded-md animate-pulse" />
          </div>
        </header>
        <div class="flex flex-1 overflow-hidden">
          <aside class="w-64 p-4 border-r border-border flex flex-col gap-4">
            <div class="h-8 w-24 bg-muted/40 rounded-md animate-pulse" />
            <div class="h-20 w-full bg-muted/40 rounded-md animate-pulse" />
            <div class="h-20 w-full bg-muted/40 rounded-md animate-pulse" />
            <div class="mt-auto h-10 w-full bg-muted/40 rounded-md animate-pulse" />
          </aside>
          <main class="flex-1 flex items-center justify-center p-8 bg-muted/20">
            <div class="relative aspect-[9/19.5] h-full max-w-full bg-background/40 rounded-3xl animate-pulse" />
          </main>
        </div>
      </div>
    </template>
  </ClientOnly>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import {
  ArrowUpCircleIcon,
  DocumentArrowDownIcon,
  DocumentTextIcon,
  SquaresPlusIcon,
  TrashIcon,
  CheckCircleIcon,
  EyeIcon,
  DocumentDuplicateIcon,
  PhotoIcon,
} from '@heroicons/vue/24/outline';
import draggable from 'vuedraggable';
import InspectorPanel from '~/components/InspectorPanel.vue';
import RecapCanvas from '~/components/RecapCanvas.client.vue';
import RecapStoryInspector from '~/components/RecapStoryInspector.vue';
import RecapStorySlide from '~/components/RecapStorySlide.vue';
import { useRoute, useRouter } from 'vue-router';
import type {
  RecapStory,
  RecapStorySlideContent,
} from '~/types/recap-story.types';
import { toast } from 'vue-sonner'
import { Button } from '~/components/shadcn/button'
import { Badge } from '~/components/shadcn/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/components/shadcn/alert-dialog'

definePageMeta({
  middleware: 'admin',
  layout: false,
});

type Slide = {
  id: string | number;
  canvas: string;
};

type EditorPageData = {
  show: { id: string; name: string; image: string | null; genres: string[] | null };
  season: { id: string; number: number; image: string | null; show_id: string };
  episodeCount: number;
  recap: null | {
    id: string;
    status: string;
    isCanonical: boolean;
    formatVersion: number;
    storyData: unknown;
    qualityReport: unknown;
    slides: Array<{ id: string; order: number; canvas_data: unknown }>;
  };
};

const route = useRoute();
const router = useRouter();

const showId = computed(() => route.query.show as string | undefined);
const seasonId = computed(() => route.query.season as string | undefined);
const requestedRecapId = computed(() => route.query.recap as string | undefined);

const slides = ref<Slide[]>([]);
const selectedSlideId = ref<string | number | null>(null);
const existingRecapId = ref<string | null>(null);
const recapStatus = ref<'draft' | 'published' | null>(null);
const storyData = ref<RecapStory | null>(null);
const qualityReport = ref<Record<string, any> | null>(null);
const isCanonical = ref(false);
const editorMode = ref<'story' | 'visual'>('story');
const selectedElement = ref<any>(null);
const isInitialized = ref(false);

// State for change detection
const initialEditorState = ref('');
const isDirty = ref(false);

const {
  data: pageData,
  pending: loading,
  error
} = useAsyncData(
  `recap-editor-data-${showId.value}-${seasonId.value}-${requestedRecapId.value || 'auto'}`,
  async () => {
    if (!showId.value || !seasonId.value) {
      return null;
    }
    return await $fetch<EditorPageData>('/api/admin/recap/editor', {
      query: {
        showId: showId.value,
        seasonId: seasonId.value,
        ...(requestedRecapId.value ? { recapId: requestedRecapId.value } : {}),
      },
    });
  },
  {
    server: false,
    watch: [showId, seasonId, requestedRecapId]
  }
);

// Reset initialization state when a new fetch is pending
watch(loading, (isLoading) => {
  if (isLoading) {
    isInitialized.value = false;
  }
});

// This effect syncs the fetched data with the local component state ONCE.
watchEffect(() => {
  if (pageData.value && !isInitialized.value) {
    const existingRecap = pageData.value.recap;
    if (existingRecap) {
      existingRecapId.value = existingRecap.id;
      recapStatus.value = existingRecap.status as 'draft' | 'published' | null;
      isCanonical.value = existingRecap.isCanonical;
      storyData.value = parseStoryData(existingRecap.storyData);
      qualityReport.value = asObject(existingRecap.qualityReport);
      const existingSlides = existingRecap.slides;
      if (existingSlides && existingSlides.length > 0) {
        slides.value = existingSlides
          .sort((a, b) => a.order - b.order)
          .map((slide) => ({
            id: slide.id,
            canvas: JSON.stringify(slide.canvas_data || {})
          }));
      } else {
        slides.value = [{ id: Date.now(), canvas: '' }];
      }
    } else {
      // Reset if there's no recap
      existingRecapId.value = null;
      recapStatus.value = null;
      isCanonical.value = false;
      storyData.value = null;
      qualityReport.value = null;
      slides.value = [{ id: Date.now(), canvas: '' }];
    }
    
    if (slides.value.length > 0) {
      selectedSlideId.value = slides.value[0]?.id ?? null;
    } else {
      selectedSlideId.value = null;
    }

    editorMode.value = storyData.value ? 'story' : 'visual';
    initialEditorState.value = createEditorSnapshot();
    isDirty.value = false;
    isInitialized.value = true; // Lock the effect
  }
});

watch([slides, storyData], () => {
  isDirty.value = createEditorSnapshot() !== initialEditorState.value;
}, { deep: true });

watch(selectedSlideId, () => {
  selectedElement.value = null;
});

watch(editorMode, () => {
  selectedElement.value = null;
});


const showName = computed(() => pageData.value?.show?.name);
const seasonNumber = computed(() => pageData.value?.season?.number);
const hasSemanticStory = computed(() => Boolean(storyData.value));
const isVerificationStale = computed(() => Boolean(
  asObject(qualityReport.value?.editorial)?.automaticVerificationStale,
));
const selectedSlideIndex = computed(() => (
  slides.value.findIndex(slide => slide.id === selectedSlideId.value)
));
const activeStoryContent = computed<RecapStorySlideContent | null>(() => {
  const story = storyData.value;
  const index = selectedSlideIndex.value;
  if (!story || index < 0) return null;
  if (index === 0) {
    return {
      kind: 'cover',
      ...story.cover,
      episodeCount: pageData.value?.episodeCount || inferEpisodeCount(story),
    };
  }
  const beat = story.beats[index - 1];
  if (!beat) return null;
  return {
    kind: 'beat',
    headline: beat.headline,
    narration: beat.narration,
    tag: beat.tag,
    episodeNumbers: beat.episodeNumbers,
  };
});
const activeSlideImageUrl = computed(() => extractCanvasImageUrl(activeSlideCanvas.value));

const activeSlideCanvas = computed({
  get() {
    if (selectedSlideId.value === null) return '';
    return slides.value.find(s => s.id === selectedSlideId.value)?.canvas ?? '';
  },
  set(newValue) {
    if (selectedSlideId.value === null) return;
    const slideIndex = slides.value.findIndex(s => s.id === selectedSlideId.value);
    const slide = slides.value[slideIndex];
    if (slideIndex !== -1 && slide) {
      slide.canvas = newValue;
    }
  }
});

const currentSlideElements = computed(() => {
  if (!activeSlideCanvas.value) return [];
  try {
    const canvasData = JSON.parse(activeSlideCanvas.value);
    const elements = canvasData.children?.[0]?.children || [];
    return hasSemanticStory.value
      ? elements.filter((element: any) => element?.className === 'Image')
      : elements;
  } catch {
    return [];
  }
});

const handleSelectElement = (element: any) => {
  selectedElement.value = element;
};

const handleSelectElementById = (elementId: string) => {
  const element = currentSlideElements.value.find((el: any) => el.attrs.id === elementId);
  if (element) {
    const textChild = element.children?.find((c: any) => c.className === 'Text');
    selectedElement.value = {
      ...element.attrs,
      text: textChild?.attrs,
    };
  }
};

const handleUpdateStoryContent = (content: RecapStorySlideContent) => {
  const story = storyData.value;
  const index = selectedSlideIndex.value;
  if (!story || index < 0) return;

  if (content.kind === 'cover' && index === 0) {
    story.cover = {
      title: content.title,
      subtitle: content.subtitle,
      logline: content.logline,
    };
    return;
  }

  if (content.kind === 'beat' && index > 0) {
    const existingBeat = story.beats[index - 1];
    if (!existingBeat) return;
    story.beats[index - 1] = {
      ...existingBeat,
      headline: content.headline,
      narration: content.narration,
      tag: content.tag,
      episodeNumbers: content.episodeNumbers,
    };
  }
};

const getSlideLabel = (index: number) => {
  if (!storyData.value) return `Slide ${index + 1}`;
  if (index === 0) return storyData.value.cover.title || 'Couverture';
  return storyData.value.beats[index - 1]?.headline || `Moment clé ${index}`;
};


const handleUpdateElement = (updatedElement: any) => {
  if (!activeSlideCanvas.value) return;

  try {
    const canvasData = JSON.parse(activeSlideCanvas.value);
    const layer = canvasData.children?.[0];
    if (!layer) return;

    const elementIndex = layer.children.findIndex((c: any) => c.attrs.id === updatedElement.id);
    if (elementIndex !== -1) {
      const currentElement = layer.children[elementIndex];
      const { text, rect, ...updatedAttrs } = updatedElement;
      const updatedChildren = currentElement.className === 'Group'
        ? currentElement.children.map((child: any) => {
            if (child.className === 'Text' && text) return { ...child, attrs: text };
            if (child.className === 'Rect' && rect) return { ...child, attrs: rect };
            return child;
          })
        : currentElement.children;
      const newCanvasData = {
        ...canvasData,
        children: [
          {
            ...layer,
            children: layer.children.map((child: any, index: number) =>
              index === elementIndex
                ? { ...child, attrs: updatedAttrs, children: updatedChildren }
                : child
            ),
          },
        ],
      };
      activeSlideCanvas.value = JSON.stringify(newCanvasData);
      selectedElement.value = updatedElement;
    }
  } catch (e) {
    console.error("Failed to parse or update canvas JSON", e);
  }
};

const goBack = () => router.back();

const addSlide = () => {
  if (hasSemanticStory.value) return;
  const newId = Date.now(); // Use a timestamp for a guaranteed unique ID
  slides.value = [...slides.value, { id: newId, canvas: '' }];
  selectedSlideId.value = newId;
};

const removeSlide = (slideToRemove: Slide) => {
  if (hasSemanticStory.value) return;
  if (slides.value.length <= 1) return;
  if (selectedSlideId.value === slideToRemove.id) {
    const currentIndex = slides.value.findIndex(s => s.id === slideToRemove.id);
    selectedSlideId.value = slides.value[currentIndex - 1]?.id ?? slides.value[0]?.id ?? null;
  }
  slides.value = slides.value.filter(s => s.id !== slideToRemove.id);
};

const isSaving = ref(false);
const isPublishing = ref(false);
const isDeleting = ref(false);

const saveDraft = async () => {
  if (!isDirty.value) return;
  isSaving.value = true;

  try {
    const result = await $fetch<{
      recapId: string;
      status: string;
      storyVerificationStale: boolean;
    }>('/api/recap/save-draft', {
      method: 'POST',
      body: {
        recapId: existingRecapId.value,
        showId: showId.value,
        seasonId: seasonId.value,
        slides: slides.value,
        storyData: storyData.value,
      }
    });
    existingRecapId.value = result.recapId;
    recapStatus.value = result.status as 'draft' | 'published';
    if (result.storyVerificationStale) markLocalVerificationStale();
    toast.success('Success', {
      description: recapStatus.value === 'published'
        ? 'Recap updated successfully.'
        : 'Draft saved successfully.'
    })
    initialEditorState.value = createEditorSnapshot();
    isDirty.value = false;
  } catch (e: any) {
    toast.error('Error', {
      description: e.data?.message || 'Failed to save draft.'
    })
  } finally {
    isSaving.value = false;
  }
};

const publishRecap = async () => {
  isPublishing.value = true;

  try {
    const result = await $fetch<{
      recapId: string;
      status: string;
      storyVerificationStale: boolean;
    }>('/api/recap/create', {
      method: 'POST',
      body: {
        recapId: existingRecapId.value,
        showId: showId.value,
        seasonId: seasonId.value,
        slides: slides.value,
        storyData: storyData.value,
      }
    });
    toast.success('Success', {
      description: 'Recap published successfully!'
    })
    existingRecapId.value = result.recapId;
    recapStatus.value = 'published';
    if (result.storyVerificationStale) markLocalVerificationStale();
    initialEditorState.value = createEditorSnapshot();
    isDirty.value = false;
  } catch (e: any) {
    toast.error('Error', {
      description: e.data?.message || 'Failed to publish recap.'
    })
  } finally {
    isPublishing.value = false;
  }
};

const deleteRecap = async () => {
  if (!existingRecapId.value) return;
  isDeleting.value = true;

  try {
    await $fetch('/api/recap/delete', {
      method: 'POST',
      body: { recapId: existingRecapId.value }
    });
    toast.success('Success', {
      description: 'Recap deleted successfully.'
    });
    goBack();
  } catch (e: any) {
    toast.error('Error', {
      description: e.data?.message || 'Failed to delete recap.'
    });
  } finally {
    isDeleting.value = false;
  }
};

const copyJsonToClipboard = async () => {
  try {
    const slidesData = slides.value.map((slide, index) => ({
      order: index + 1,
      canvas: JSON.parse(slide.canvas),
    }));
    const jsonToCopy = JSON.stringify({ storyData: storyData.value, slides: slidesData }, null, 2);
    await navigator.clipboard.writeText(jsonToCopy);
    toast.success('Success', {
      description: 'JSON copied to clipboard!'
    });
  } catch (e) {
    console.error("Failed to copy JSON to clipboard", e);
    toast.error('Error', {
      description: 'Failed to copy JSON to clipboard.'
    });
  }
};

function createEditorSnapshot() {
  return JSON.stringify({ slides: slides.value, storyData: storyData.value });
}

function parseStoryData(value: unknown): RecapStory | null {
  const story = asObject(value);
  const cover = asObject(story?.cover);
  if (!story || !cover || !Array.isArray(story.beats) || typeof cover.title !== 'string') return null;

  return {
    locale: typeof story.locale === 'string' ? story.locale : 'fr',
    spoilerScope: 'through-season',
    cover: {
      title: cover.title,
      subtitle: typeof cover.subtitle === 'string' ? cover.subtitle : '',
      logline: typeof cover.logline === 'string' ? cover.logline : '',
    },
    beats: story.beats.map((item: unknown) => {
      const beat = asObject(item) || {};
      const episodeNumbers = Array.isArray(beat.episodeNumbers)
        ? beat.episodeNumbers.map(Number).filter(number => Number.isInteger(number) && number > 0)
        : [];
      return {
        headline: typeof beat.headline === 'string' ? beat.headline : '',
        narration: typeof beat.narration === 'string' ? beat.narration : '',
        tag: typeof beat.tag === 'string' ? beat.tag : '',
        episodeNumbers,
        imageEpisodeNumber: Number.isInteger(Number(beat.imageEpisodeNumber))
          ? Number(beat.imageEpisodeNumber)
          : (episodeNumbers[0] || 1),
        eventIds: readStringArray(beat.eventIds),
        evidenceIds: readStringArray(beat.evidenceIds),
      };
    }),
  };
}

function inferEpisodeCount(story: RecapStory) {
  return story.beats.reduce((highest, beat) => Math.max(highest, ...beat.episodeNumbers, 0), 0);
}

function extractCanvasImageUrl(canvas: string): string | null {
  if (!canvas) return null;
  try {
    const stage = asObject(JSON.parse(canvas));
    const layers = Array.isArray(stage?.children) ? stage.children : [];
    for (const layerItem of layers) {
      const layer = asObject(layerItem);
      const children = Array.isArray(layer?.children) ? layer.children : [];
      for (const childItem of children) {
        const child = asObject(childItem);
        const attrs = asObject(child?.attrs);
        if (child?.className === 'Image' && typeof attrs?.src === 'string') return attrs.src;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function markLocalVerificationStale() {
  qualityReport.value = {
    ...(qualityReport.value || {}),
    editorial: {
      edited: true,
      editedAt: new Date().toISOString(),
      automaticVerificationStale: true,
    },
  };
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

function asObject(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}
</script>
