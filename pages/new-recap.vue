<template>
  <div class="h-screen w-full flex flex-col bg-background text-foreground">
    <!-- Header -->
    <header class="flex items-center justify-between p-4 border-b border-border">
      <div class="flex items-center gap-4">
        <router-link to="/">
          <Logo variant="white" class="h-8 w-8" />
        </router-link>
        <div>
          <h1 class="text-lg font-semibold">Recap Editor</h1>
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
          <CheckCircleIcon v-else-if="!isDirty" class="h-4 w-4 text-green-500" />
          <DocumentArrowDownIcon v-else class="h-4 w-4" />
          <span class="ml-2">
            <template v-if="isSaving">Saving...</template>
            <template v-else-if="!isDirty">Saved</template>
            <template v-else>Save Draft</template>
          </span>
        </Button>
        <Button class="min-w-[130px]" :disabled="loading || isPublishing" @click="publishRecap">
          <span v-if="isPublishing" class="loading loading-spinner h-4 w-4" />
          <ArrowUpCircleIcon v-else class="h-4 w-4" />
          <span class="ml-2">{{ isPublishing ? 'Publishing...' : 'Publish' }}</span>
        </Button>
      </div>
    </header>

    <div class="flex flex-1 overflow-hidden">
      <!-- Sidebar -->
      <aside class="w-64 p-4 border-r border-border flex flex-col gap-4 overflow-y-auto">
        <h2 class="text-xl font-semibold tracking-tight">Slides</h2>
        <div
          v-for="(slide, index) in slides"
          :key="slide.id"
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
        <Button variant="outline" class="mt-auto" @click="addSlide">
          <SquaresPlusIcon class="h-4 w-4 mr-2" />
          Add Slide
        </Button>
      </aside>

      <!-- Main Canvas -->
      <main class="flex-1 flex items-center justify-center p-8 bg-muted/20">
        <div v-if="error" class="text-destructive">
          <p>{{ error.message }}</p>
          <Button class="mt-2" @click="goBack">Go Back</Button>
        </div>
        <RecapCanvas v-else v-model="activeSlideCanvas" :loading="loading" />
      </main>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import {
  ArrowUpCircleIcon,
  DocumentArrowDownIcon,
  SquaresPlusIcon,
  TrashIcon,
  CheckCircleIcon,
} from '@heroicons/vue/24/outline';
import { useRoute, useRouter } from 'vue-router';
import type { Show, Season } from '~/types/database.types';
import { toast } from 'vue-sonner'
import { Button } from '~/components/shadcn/button'

type Slide = {
  id: number;
  canvas: string;
};

const route = useRoute();
const router = useRouter();
const supabase = useSupabaseClient();
const user = useSupabaseUser();

const showId = computed(() => route.query.show as string | undefined);
const seasonId = computed(() => route.query.season as string | undefined);

const slides = ref<Slide[]>([]);
const selectedSlideId = ref(1);

// State for change detection
const initialSlidesState = ref('');
const isDirty = ref(false);

const {
  data: pageData,
  pending: loading,
  error
} = useAsyncData(
  `new-recap-data-${showId.value}-${seasonId.value}`,
  async () => {
    if (!showId.value || !seasonId.value || !user.value) {
      throw new Error('Show ID, Season ID, and User are required.');
    }

    const showPromise = supabase.from('show').select('id, name, image').eq('id', showId.value).single();
    const seasonPromise = supabase.from('season').select('id, number').eq('id', seasonId.value).single();
    const recapPromise = supabase
      .from('recap')
      .select('*, slide(*)')
      .eq('season_id', seasonId.value)
      .eq('user_id', user.value.id)
      .maybeSingle();

    const [showResult, seasonResult, recapResult] = await Promise.all([showPromise, seasonPromise, recapPromise]);

    if (showResult.error) throw showResult.error;
    if (seasonResult.error) throw seasonResult.error;
    if (recapResult.error) throw recapResult.error;

    const existingSlides = recapResult.data?.slide;
    if (existingSlides && existingSlides.length > 0) {
      slides.value = existingSlides
        .sort((a, b) => a.order - b.order)
        .map((slide, index) => ({
          id: index + 1,
          canvas: JSON.stringify(slide.canvas_data)
        }));
    } else {
      slides.value = [{ id: 1, canvas: '' }];
    }
    selectedSlideId.value = 1;
    
    // Capture the initial state after loading
    initialSlidesState.value = JSON.stringify(slides.value);
    isDirty.value = false;

    return {
      show: showResult.data as Show,
      season: seasonResult.data as Season
    };
  },
  {
    watch: [showId, seasonId]
  }
);

// Watch for any changes in the slides to update the dirty state
watch(slides, (newSlides) => {
  isDirty.value = JSON.stringify(newSlides) !== initialSlidesState.value;
}, { deep: true });


const showName = computed(() => pageData.value?.show?.name);
const seasonNumber = computed(() => pageData.value?.season?.number);

const activeSlideCanvas = computed({
  get() {
    return slides.value.find(s => s.id === selectedSlideId.value)?.canvas ?? '';
  },
  set(newValue) {
    const slideIndex = slides.value.findIndex(s => s.id === selectedSlideId.value);
    if (slideIndex !== -1) {
      slides.value[slideIndex].canvas = newValue;
    }
  }
});

const goBack = () => router.back();

const addSlide = () => {
  const newId = (slides.value.at(-1)?.id ?? 0) + 1;
  slides.value.push({ id: newId, canvas: '' });
  selectedSlideId.value = newId;
};

const removeSlide = (slideToRemove: Slide) => {
  if (slides.value.length <= 1) return;
  if (selectedSlideId.value === slideToRemove.id) {
    const currentIndex = slides.value.findIndex(s => s.id === slideToRemove.id);
    selectedSlideId.value = slides.value[currentIndex - 1]?.id ?? slides.value[0]?.id;
  }
  slides.value = slides.value.filter(s => s.id !== slideToRemove.id);
};

const isSaving = ref(false);
const isPublishing = ref(false);

const saveDraft = async () => {
  if (!isDirty.value) return;
  isSaving.value = true;

  try {
    await $fetch('/api/recap/save-draft', {
      method: 'POST',
      body: {
        showId: showId.value,
        seasonId: seasonId.value,
        slides: slides.value
      }
    });
    toast.success('Success', {
      description: 'Draft saved successfully!'
    })
    // Update the initial state to the new saved state
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
    setTimeout(() => {
      router.push(`/shows/${pageData.value?.show?.name}-${showId.value}`);
    }, 2000);
  } catch (e: any) {
    toast.error('Error', {
      description: e.data?.message || 'Failed to publish recap.'
    })
  } finally {
    isPublishing.value = false;
  }
};
</script>

