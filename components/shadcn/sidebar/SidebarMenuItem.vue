<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'
import { NuxtLink } from '#components'
import SidebarMenuButtonChild, { type SidebarMenuButtonProps } from './SidebarMenuButtonChild.vue'

const props = defineProps<SidebarMenuButtonProps & {
  class?: HTMLAttributes['class']
  to?: string
}>()
</script>

<template>
  <li
    data-sidebar="menu-item"
    :class="cn('group/menu-item relative', props.class)"
  >
    <SidebarMenuButtonChild
      :as="to ? NuxtLink : 'button'"
      :to="to"
      :variant="props.variant"
      :size="props.size"
      :is-active="props.isActive"
      :class="props.class"
    >
      <slot />
    </SidebarMenuButtonChild>
  </li>
</template>
