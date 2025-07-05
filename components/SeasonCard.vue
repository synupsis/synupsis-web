<template>
  <Card class="flex flex-col">
    <CardHeader>
      <div class="flex items-center justify-between">
        <CardTitle>Season {{ season.number }}</CardTitle>
        <Badge v-if="isDraft" variant="secondary">Draft</Badge>
      </div>
      <CardDescription v-if="season.name">{{ season.name }}</CardDescription>
    </CardHeader>
    <CardContent class="flex-grow">
      <p class="text-sm text-muted-foreground">
        <span v-if="isPublished">A recap is available for this season.</span>
        <span v-else-if="isDraft">A draft is in progress.</span>
        <span v-else>No recap available for this season yet.</span>
      </p>
    </CardContent>
    <CardFooter class="flex flex-col items-stretch gap-2">
      <Button
        v-if="isPublished"
        variant="secondary"
        @click="emit('view', publishedRecap.id)"
      >
        <EyeIcon class="mr-2 h-4 w-4" />
        View Recap
      </Button>

      <ClientOnly>
        <template v-if="user && isAdmin">
          <Button
            v-if="isDraft || isPublished"
            class="w-full"
            @click="emit('edit', season.id)"
          >
            <PencilIcon class="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button
            v-else
            class="w-full"
            @click="emit('create', season.id)"
          >
            <SquaresPlusIcon class="mr-2 h-4 w-4" />
            Create Recap
          </Button>
        </template>
        <template #fallback>
          <div class="h-10 w-full" />
        </template>
      </ClientOnly>
      <Button
        v-if="!isPublished && !isDraft"
        :disabled="isGenerating"
        variant="outline"
        @click="emit('generate', season.id)"
      >
        <SpinLoader v-if="isGenerating" class="mr-2 h-4 w-4" />
        <SparklesIcon v-else class="mr-2 h-4 w-4" />
        Generate Recap
      </Button>
    </CardFooter>
  </Card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Button } from '~/components/shadcn/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/components/shadcn/card';
import { Badge } from '~/components/shadcn/badge';
import { EyeIcon, PencilIcon, SparklesIcon, SquaresPlusIcon } from '@heroicons/vue/24/outline';
import SpinLoader from '~/components/ui/SpinLoader.vue';

const props = defineProps<{
  season: any;
  isAdmin: boolean;
  isGenerating: boolean;
}>();

const emit = defineEmits(['view', 'edit', 'create', 'generate']);

const user = useSupabaseUser();

const publishedRecap = computed(() => (props.season.recap || []).find((r: any) => r.status === 'published'));
const draftRecap = computed(() => (props.season.recap || []).find((r: any) => r.status === 'draft'));

const isPublished = computed(() => !!publishedRecap.value);
const isDraft = computed(() => !!draftRecap.value);
</script>
