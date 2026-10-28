<script setup lang="ts">
const { t } = useI18n();
import type { HTMLAttributes } from 'vue'
import { PanelLeft } from 'lucide-vue-next'
import { cn } from '~/lib/utils'
import { useSidebar } from './utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const { toggleSidebar } = useSidebar()
</script>

<template>
  <Button
    data-sidebar="trigger"
    variant="ghost"
    size="icon"
    :class="cn('h-7 w-7', props.class)"
    @click="toggleSidebar"
  >
    <PanelLeft />
    <span class="sr-only">{{ t('Toggle Sidebar') }}</span>
  </Button>
</template>
