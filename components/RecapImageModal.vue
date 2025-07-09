<template>
  <AlertDialog :open="isOpen" @update:open="emit('update:isOpen', $event)">
    <AlertDialogContent class="max-w-3xl">
      <AlertDialogHeader>
        <DialogTitle>Select Image</DialogTitle>
        <AlertDialogDescription>
          Select a background for your slide from the episode images below.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div v-if="loading" class="flex justify-center items-center h-64">
        <div class="loading loading-spinner" />
      </div>
      <div v-else-if="error" class="text-destructive">
        <p>Failed to load images. Please try again later.</p>
      </div>
      <div v-else class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-[60vh] overflow-y-auto p-1">
        <div
          v-for="(image, index) in images"
          :key="image?.original || index"
          class="relative aspect-video bg-muted rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary ring-offset-2 ring-offset-background transition-all"
          @click="selectImage(image.original)"
        >
          <img
            v-if="image?.medium"
            :src="useImageUrl(image.medium)"
            class="w-full h-full object-cover"
            alt="Episode image"
          />
          <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            No Image
          </div>
          <div class="absolute bottom-1 right-1 bg-background/80 text-foreground text-xs px-1.5 py-0.5 rounded-sm">
            Ep. {{ image.episode }}
          </div>
        </div>
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/shadcn/alert-dialog'
import { useImageUrl } from '~/composables/useUtils';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  seasonId: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['update:isOpen', 'select-image']);

const images = ref<any[]>([]);
const loading = ref(false);
const error = ref<Error | null>(null);

watch(() => props.isOpen, async (newVal) => {
  if (newVal && props.seasonId) {
    loading.value = true;
    error.value = null;
    try {
      const response = await $fetch(`/api/shows/season-images?seasonId=${props.seasonId}`);
      images.value = response.body.filter(image => image.original && image.medium);
    } catch (e: any) {
      error.value = e;
    } finally {
      loading.value = false;
    }
  }
});

const selectImage = (imageUrl: string) => {
  if (!imageUrl) return;
  emit('select-image', imageUrl);
  emit('update:isOpen', false);
};
</script>