<template>
  <Card class="flex flex-col group overflow-hidden border-2" :class="{ 'border-primary shadow-lg shadow-primary/20': isLatest, 'border-transparent': !isLatest }">
    <div class="relative w-full aspect-[2/3]">
      <!-- Image -->
      <CachedImage v-if="season.image" :src="season.image" :alt="`Poster for Season ${season.number}`" class="w-full h-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-105" />
      <!-- Placeholder Gradient -->
      <div v-else class="w-full h-full bg-gradient-to-t from-black via-gray-800 to-gray-900" />
      
      <!-- Gradient Overlay -->
      <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
      
      <!-- Latest Badge -->
      <Badge v-if="isLatest" class="absolute top-2 right-2">Latest</Badge>

      <!-- Content Overlay -->
      <div class="absolute inset-0 flex flex-col justify-end p-4 text-white">
        <div class="flex items-center justify-between">
          <CardTitle class="text-lg font-bold">{{ season.name || `Season ${season.number}` }}</CardTitle>
          <Badge v-if="isDraft" variant="secondary" class="text-xs">Draft</Badge>
        </div>
        
        <div class="flex items-center gap-4 mt-4">
          <Button
            v-if="isPublished"
            variant="secondary"
            size="sm"
            class="flex-grow"
            @click="emit('view', publishedRecap.id)"
          >
            <EyeIcon class="mr-2 h-4 w-4" />
            View
          </Button>

          <ClientOnly>
            <template v-if="user && isAdmin">
              <Button
                v-if="isDraft || isPublished"
                variant="outline"
                size="icon"
                @click="emit('edit', season.id)"
              >
                <PencilIcon class="h-4 w-4" />
              </Button>
              <Button
                v-else
                size="sm"
                class="flex-grow"
                @click="emit('create', season.id)"
              >
                <SquaresPlusIcon class="mr-2 h-4 w-4" />
                Create
              </Button>
            </template>
          </ClientOnly>

          <Button
            v-if="!isPublished && !isDraft"
            variant="outline"
            size="sm"
            class="flex-grow"
            :disabled="isGenerating"
            @click="emit('generate', season.id)"
          >
            <SparklesIcon v-if="!isGenerating" class="mr-2 h-4 w-4" />
            <SpinLoader v-else class="mr-2 h-4 w-4" />
            Generate
          </Button>
        </div>
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Button } from '~/components/shadcn/button';
import { Card, CardTitle } from '~/components/shadcn/card';
import { Badge } from '~/components/shadcn/badge';
import { EyeIcon, PencilIcon, SparklesIcon, SquaresPlusIcon } from '@heroicons/vue/24/outline';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import { useImageUrl } from '~/composables/useUtils';
import CachedImage from '~/components/CachedImage.vue';

const props = defineProps<{
  season: any;
  isAdmin: boolean;
  isGenerating: boolean;
  isLatest: boolean;
}>();

const emit = defineEmits(['view', 'edit', 'create', 'generate']);

const user = useSupabaseUser();

const publishedRecap = computed(() => (props.season.recap || []).find((r: any) => r.status === 'published'));
const draftRecap = computed(() => (props.season.recap || []).find((r: any) => r.status === 'draft'));

const isPublished = computed(() => !!publishedRecap.value);
const isDraft = computed(() => !!draftRecap.value);
</script>