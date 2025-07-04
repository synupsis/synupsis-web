<script lang="ts" setup>
import { Toaster as Sonner, type ToasterProps } from 'vue-sonner'

const props = defineProps<ToasterProps>()
</script>

<template>
  <Sonner
    class="toaster group"
    v-bind="props"
    :toast-options="{
      classes: {
        toast:
          'group my-toast flex items-center w-full max-w-sm p-4 space-x-4 rounded-lg shadow-lg group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border',
        title: 'group-[.my-toast]:font-semibold',
        description: 'group-[.my-toast]:text-sm group-[.my-toast]:text-muted-foreground',
        actionButton:
          'group-[.my-toast]:bg-primary group-[.my-toast]:text-primary-foreground',
        cancelButton:
          'group-[.my-toast]:bg-muted group-[.my-toast]:text-muted-foreground',
      },
    }"
  />
</template>
