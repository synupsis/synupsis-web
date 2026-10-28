<template>
  <img :src="imageUrl" :alt="alt" v-bind="$attrs" @error="onImageError" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { proxiedImageUrl } from '~/lib/image-url'

const props = defineProps<{
  src: string | null | undefined
  alt?: string
}>()

const error = ref(false)

const imageUrl = computed(() => (error.value ? '' : proxiedImageUrl(props.src)))

const onImageError = () => {
  error.value = true
}
</script>
