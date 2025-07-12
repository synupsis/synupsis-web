<template>
  <img :src="imageUrl" :alt="alt" v-bind="$attrs" @error="onImageError" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useImageUrl } from '~/composables/useUtils'

const props = defineProps<{
  src: string | null | undefined
  alt?: string
}>()

const error = ref(false)

const imageUrl = computed(() => {
  if (error.value || !props.src) {
    return '/svg/logo.svg' // Image de remplacement
  }
  return useImageUrl(props.src)
})

const onImageError = () => {
  error.value = true
}
</script>
