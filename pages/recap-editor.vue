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
      <div v-if="!loading && pageData" class="flex flex-1 overflow-hidden">
        <!-- Slides Sorter (Left) -->
        <aside class="w-64 p-4 border-r border-border flex flex-col gap-4 overflow-y-auto">
          <h2 class="text-xl font-semibold tracking-tight">Slides</h2>
          <draggable v-model="slides" item-key="id" class="space-y-2">
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
                  <p class="font-bold">Slide {{ index + 1 }}</p>
                  <p class="text-sm text-muted-foreground">ID: {{ slide.id }}</p>
                </button>
                <button
                  class="absolute top-2 right-2 p-1 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  @click.stop="removeSlide(slide)"
                >
                  <TrashIcon class="h-4 w-4" />
                </button>
              </div>
            </template>
          </draggable>
          <div class="mt-auto space-y-2">
            <Button variant="outline" class="w-full" @click="addSlide">
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

        <!-- Main Canvas (Center) -->
        <main class="flex-1 flex items-center justify-center p-4 sm:p-8 bg-muted/20 overflow-hidden">
          <div v-if="error" class="text-destructive">
            <p>{{ error.message }}</p>
            <Button class="mt-2" @click="goBack">Go Back</Button>
          </div>
          <div
            v-else
            class="relative aspect-[9/19.5] h-full max-w-full bg-background rounded-3xl shadow-lg"
          >
            <RecapCanvas
              :key="selectedSlideId ?? 'no-slide'"
              v-model="activeSlideCanvas"
              :loading="loading"
              :season-id="seasonId"
              :selected-element-id="selectedElement?.id"
              @select-element="handleSelectElement"
            />
          </div>
        </main>

        <!-- Inspector Panel (Right) -->
        <InspectorPanel
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
import { ref, computed, watch, onUnmounted } from 'vue';
import {
  ArrowUpCircleIcon,
  DocumentArrowDownIcon,
  SquaresPlusIcon,
  TrashIcon,
  CheckCircleIcon,
  EyeIcon,
  DocumentDuplicateIcon,
} from '@heroicons/vue/24/outline';
import draggable from 'vuedraggable';
import InspectorPanel from '~/components/InspectorPanel.vue';
import RecapCanvas from "~/components/RecapCanvas.client.vue";
import { useRoute, useRouter } from 'vue-router';
import type { Show, Season } from '~/types/database.types';
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
  middleware: 'admin'
});

type Slide = {
  id: string | number;
  canvas: string;
};

const route = useRoute();
const router = useRouter();
const supabase = useSupabaseClient();
const user = useSupabaseUser();

const showId = computed(() => route.query.show as string | undefined);
const seasonId = computed(() => route.query.season as string | undefined);

const slides = ref<Slide[]>([]);
const selectedSlideId = ref<string | number | null>(null);
const existingRecapId = ref<string | null>(null);
const recapStatus = ref<'draft' | 'published' | null>(null);
const selectedElement = ref<any>(null);
const isInitialized = ref(false);

// State for change detection
const initialSlidesState = ref('');
const isDirty = ref(false);

const {
  data: pageData,
  pending: loading,
  error
} = useAsyncData(
  `recap-editor-data-${showId.value}-${seasonId.value}-${user.value?.sub}`,
  async () => {
    if (!user.value || !showId.value || !seasonId.value) {
      return null;
    }

    const showPromise = supabase.from('show').select('id, name, image').eq('id', showId.value).single();
    const seasonPromise = supabase.from('season').select('id, number').eq('id', seasonId.value).single();
    const recapPromise = supabase
      .from('recap')
      .select('id, status, slide(*)')
      .eq('season_id', seasonId.value)
      .eq('user_id', user.value.sub)
      .maybeSingle();

    const [showResult, seasonResult, recapResult] = await Promise.all([showPromise, seasonPromise, recapPromise]);

    if (showResult.error) throw showResult.error;
    if (seasonResult.error) throw seasonResult.error;
    if (recapResult.error) throw recapResult.error;

    return {
      show: showResult.data as Show,
      season: seasonResult.data as Season,
      recap: recapResult.data
    };
  },
  {
    watch: [showId, seasonId, user]
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
      const existingSlides = existingRecap.slide;
      if (existingSlides && existingSlides.length > 0) {
        slides.value = existingSlides
          .sort((a, b) => a.order - b.order)
          .map((slide) => ({
            id: slide.id, // Use the real ID from the database
            canvas: JSON.stringify(slide.canvas_data)
          }));
      } else {
        slides.value = [{ id: Date.now(), canvas: '' }];
      }
    } else {
      // Reset if there's no recap
      existingRecapId.value = null;
      recapStatus.value = null;
      slides.value = [{ id: Date.now(), canvas: '' }];
    }
    
    if (slides.value.length > 0) {
      selectedSlideId.value = slides.value[0]?.id ?? null;
    } else {
      selectedSlideId.value = null;
    }

    initialSlidesState.value = JSON.stringify(slides.value);
    isDirty.value = false;
    isInitialized.value = true; // Lock the effect
  }
});

// Watch for any changes in the slides to update the dirty state
watch(slides, (newSlides) => {
  isDirty.value = JSON.stringify(newSlides) !== initialSlidesState.value;
}, { deep: true });

onUnmounted(() => {
  // No-op
});


const showName = computed(() => pageData.value?.show?.name);
const seasonNumber = computed(() => pageData.value?.season?.number);

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
    return canvasData.children?.[0]?.children || [];
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
    // Reconstruct the element object to match the structure expected by the inspector
    const textChild = element.children.find((c: any) => c.className === 'Text');
    selectedElement.value = {
      ...element.attrs,
      text: textChild?.attrs,
    };
  }
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
  const newId = Date.now(); // Use a timestamp for a guaranteed unique ID
  slides.value = [...slides.value, { id: newId, canvas: '' }];
  selectedSlideId.value = newId;
};

const removeSlide = (slideToRemove: Slide) => {
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
    const { recapId } = await $fetch('/api/recap/save-draft', {
      method: 'POST',
      body: {
        showId: showId.value,
        seasonId: seasonId.value,
        slides: slides.value
      }
    });
    existingRecapId.value = recapId;
    toast.success('Success', {
      description: 'Draft saved successfully!'
    })
    initialSlidesState.value = JSON.stringify(slides.value);
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
    await $fetch('/api/recap/create', {
      method: 'POST',
      body: {
        showId: showId.value,
        seasonId: seasonId.value,
        slides: slides.value
      }
    });
    toast.success('Success', {
      description: 'Recap published successfully!'
    })
    recapStatus.value = 'published';
    initialSlidesState.value = JSON.stringify(slides.value);
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
    const jsonToCopy = JSON.stringify({ slides: slidesData }, null, 2);
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
</script>
