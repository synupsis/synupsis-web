<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { CheckIcon } from 'lucide-vue-next'
import {
  DropdownMenuItemIndicator,
  DropdownMenuRadioItem,
  type DropdownMenuRadioItemEmits,
  type DropdownMenuRadioItemProps,
  useForwardPropsEmits,
} from 'reka-ui'
import { cn } from '~/lib/utils'

const props = defineProps<DropdownMenuRadioItemProps & { class?: HTMLAttributes['class'] }>()

const emits = defineEmits<DropdownMenuRadioItemEmits>()

const delegatedProps = reactiveOmit(props, 'class')

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DropdownMenuRadioItem
    v-bind="forwarded"
    :class="cn(
      'relative flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground outline-none transition-colors data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-foreground data-[state=checked]:bg-white/10 data-[state=checked]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 motion-reduce:transition-none [&>svg]:size-4 [&>svg]:shrink-0',
      props.class,
    )"
  >
    <slot />
    <DropdownMenuItemIndicator class="ml-auto flex h-4 w-4 shrink-0 items-center justify-center">
      <CheckIcon class="h-4 w-4" aria-hidden="true" />
    </DropdownMenuItemIndicator>
  </DropdownMenuRadioItem>
</template>
