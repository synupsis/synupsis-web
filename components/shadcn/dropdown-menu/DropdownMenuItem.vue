<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { DropdownMenuItem, type DropdownMenuItemProps, useForwardProps } from 'reka-ui'
import { cn } from '~/lib/utils'

const props = defineProps<DropdownMenuItemProps & { class?: HTMLAttributes['class'], inset?: boolean }>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <DropdownMenuItem
    v-bind="forwardedProps"
    :class="cn(
      'relative flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground outline-none transition-colors data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 motion-reduce:transition-none [&>svg]:size-4 [&>svg]:shrink-0',
      inset && 'pl-10',
      props.class,
    )"
  >
    <slot />
  </DropdownMenuItem>
</template>
