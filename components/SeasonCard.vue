<template>
  <Card
    class="group flex flex-col overflow-hidden border-2"
    :class="{
      'border-primary shadow-lg shadow-primary/20': isLatest && !spoilerLocked,
      'border-transparent': !isLatest || spoilerLocked,
      'opacity-75': spoilerLocked,
    }"
  >
    <div class="relative w-full aspect-[2/3]">
      <!-- Image -->
      <CachedImage v-if="season.image" :src="season.image" :alt="t('Poster for Season {number}', { number: season.number })" class="w-full h-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-105" />
      <!-- Placeholder Gradient -->
      <div v-else class="w-full h-full bg-gradient-to-t from-black via-gray-800 to-gray-900" />
      
      <!-- Gradient Overlay -->
      <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
      
      <!-- Latest Badge -->
      <Badge v-if="isLatest" class="absolute top-2 right-2">{{ t('Latest') }}</Badge>
      <Badge v-if="spoilerLocked" variant="secondary" class="absolute left-2 top-2 gap-1 bg-black/70 text-white">
        <LockClosedIcon class="h-3.5 w-3.5" />
        {{ t('Spoiler protection') }}
      </Badge>

      <!-- Content Overlay -->
      <div class="absolute inset-0 flex flex-col justify-end p-4 text-white">
        <div class="flex items-center justify-between">
          <CardTitle class="text-lg font-bold">{{ season.name || t('Season {number}', { number: season.number }) }} <span v-if="season.first_aired" class="text-muted-foreground font-normal text-base ml-1">{{ new Date(season.first_aired).getFullYear() }}</span></CardTitle>
          <Badge v-if="isDraft" variant="secondary" class="text-xs">{{ t('Draft') }}</Badge>
        </div>
        
        <div class="mt-4 flex items-center gap-4">
          <Button v-if="spoilerLocked" variant="secondary" size="sm" class="flex-grow" disabled>
            <LockClosedIcon class="mr-2 h-4 w-4" />
            {{ t('Recap locked') }}
          </Button>

          <Button
            v-else-if="isPublished"
            variant="secondary"
            size="sm"
            class="flex-grow"
            @click="emit('view', publishedRecap.id)"
          >
            <EyeIcon class="mr-2 h-4 w-4" />
            {{ t('View') }}
          </Button>

          <ClientOnly v-if="!spoilerLocked">
            <template v-if="user && isAdmin">
              <Button
                v-if="isDraft || isPublished"
                variant="outline"
                size="icon"
                @click="emit('edit', publishedRecap?.id || draftRecap?.id)"
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
                {{ t('Create') }}
              </Button>
            </template>
          </ClientOnly>

          <Button
            v-if="!spoilerLocked && !isPublished && !isDraft"
            variant="outline"
            size="sm"
            class="flex-grow"
            :disabled="isGenerating"
            @click="emit('generate', season.id)"
          >
            <SparklesIcon v-if="!isGenerating" class="mr-2 h-4 w-4" />
            <SpinLoader v-else class="mr-2 h-4 w-4" />
            <template v-if="isGenerating">{{ generationProgress }}%</template>
            <template v-else>{{ user ? t('Generate') : t('Sign in to generate') }}</template>
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
import { EyeIcon, LockClosedIcon, PencilIcon, SparklesIcon, SquaresPlusIcon } from '@heroicons/vue/24/outline';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import CachedImage from '~/components/CachedImage.vue';

const { t } = useI18n();

const props = defineProps<{
  season: any;
  isAdmin: boolean;
  isGenerating: boolean;
  generationProgress?: number;
  isLatest: boolean;
  spoilerLocked?: boolean;
}>();

const emit = defineEmits(['view', 'edit', 'create', 'generate']);

const user = useSupabaseUser();

const publishedRecap = computed(() => (props.season.recap || []).find((r: any) => r.status === 'published'));
const draftRecap = computed(() => (props.season.recap || []).find((r: any) => r.status === 'draft'));

const isPublished = computed(() => !!publishedRecap.value);
const isDraft = computed(() => !!draftRecap.value);
</script>
