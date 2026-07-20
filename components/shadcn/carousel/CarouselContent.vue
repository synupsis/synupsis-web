<script setup lang="ts">
import type { WithClassAsProps } from './interface'
import type { ComponentPublicInstance } from 'vue'
import { cn } from '@/lib/utils'
import { useCarousel } from './useCarousel'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<WithClassAsProps>()

const { carouselRef, orientation } = useCarousel()

const setCarouselRef = (element: Element | ComponentPublicInstance | null) => {
  carouselRef.value = element instanceof HTMLElement ? element : undefined
}
</script>

<template>
  <div :ref="setCarouselRef" class="overflow-hidden">
    <div
      :class="
        cn(
          'flex',
          orientation === 'horizontal' ? '-ml-4' : '-mt-4 flex-col',
          props.class,
        )"
      v-bind="$attrs"
    >
      <slot />
    </div>
  </div>
</template>
