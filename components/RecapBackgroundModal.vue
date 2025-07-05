<template>
  <AlertDialog :open="isOpen" @update:open="emit('update:isOpen', $event)">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Choose a background</AlertDialogTitle>
        <AlertDialogDescription>
          Select a background for your slide.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div class="flex flex-wrap gap-2">
        <div
          v-for="n in 5"
          class="w-32 h-32 bg-gray-300 rounded-xl flex items-center justify-center"
        >
          bg #{{ n }}
        </div>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction>Continue</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script lang="ts" setup>
import {
  AlertDialog,
  AlertDialogAction,
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
  }
});

const emit = defineEmits(['update:isOpen']);
</script>