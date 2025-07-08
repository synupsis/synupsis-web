<template>
  <Dialog :open="isOpen" @update:open="$emit('update:isOpen', $event)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Upload new avatar</DialogTitle>
        <DialogDescription>
          Select an image from your device. It will be cropped to a square.
        </DialogDescription>
      </DialogHeader>
      <div class="py-4">
        <input type="file" @change="onFileChange" accept="image/*" class="w-full" />
        <p v-if="error" class="text-destructive text-sm mt-2">{{ error }}</p>
      </div>
      <DialogFooter>
        <Button variant="ghost" @click="$emit('update:isOpen', false)">Cancel</Button>
        <Button @click="uploadAvatar" :disabled="!selectedFile || isLoading">
          <SpinLoader v-if="isLoading" class="h-4 w-4 mr-2" />
          Upload
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/shadcn/dialog';
import { Button } from '~/components/shadcn/button';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import { toast } from 'vue-sonner';

defineProps<{
  isOpen: boolean;
}>();
const emit = defineEmits(['update:isOpen', 'upload-success']);

const selectedFile = ref<File | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    selectedFile.value = target.files[0];
    error.value = null;
  }
};

const uploadAvatar = async () => {
  if (!selectedFile.value) return;

  isLoading.value = true;
  error.value = null;

  const formData = new FormData();
  formData.append('file', selectedFile.value);

  try {
    const { avatarUrl } = await $fetch('/api/user/avatar', {
      method: 'POST',
      body: formData,
    });
    toast.success('Avatar updated successfully!');
    emit('upload-success', avatarUrl);
    emit('update:isOpen', false);
  } catch (e: any) {
    error.value = e.data?.message || 'An error occurred during upload.';
    toast.error('Upload failed', { description: error.value });
  } finally {
    isLoading.value = false;
  }
};
</script>
