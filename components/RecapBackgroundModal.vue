<template>
  <AlertDialog :open="isOpen" @update:open="emit('update:isOpen', $event)">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Choose a background</AlertDialogTitle>
        <AlertDialogDescription>
          Select a background for your slide.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div v-if="loading" class="flex justify-center items-center h-64">
        <div class="loading loading-spinner" />
      </div>
      <div v-else-if="error" class="text-destructive">
        <p>Failed to load images. Please try again later.</p>
      </div>
      <div v-else class="grid grid-cols-3 gap-2 max-h-96 overflow-y-auto">
        <img
          v-for="(image, index) in images"
          :key="index"
          :src="image.original"
          class="w-full h-auto object-cover rounded-md cursor-pointer hover:ring-2 hover:ring-primary"
          @click="selectImage(image.original)"
        />
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

const images = ref([]);
const loading = ref(false);
const error = ref<Error | null>(null);

watch(() => props.isOpen, async (newVal) => {
  if (newVal && props.seasonId) {
    loading.value = true;
    error.value = null;
    try {
      const response = await $fetch(`/api/shows/season-images?seasonId=${props.seasonId}`);
      images.value = response.body;
    } catch (e: any) {
      error.value = e;
    } finally {
      loading.value = false;
    }
  }
});

const selectImage = (imageUrl: string) => {
  emit('select-image', imageUrl);
  emit('update:isOpen', false);
};
</script>
