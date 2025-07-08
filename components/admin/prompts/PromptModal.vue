<script setup lang="ts">
import { ref, watch } from 'vue'
import { Button } from '@/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/shadcn/dialog'
import { Input } from '@/components/shadcn/input'
import { Textarea } from '@/components/shadcn/textarea'
import { Checkbox } from '@/components/shadcn/checkbox'
import type { Prompt } from '~/types/database.types'

const props = defineProps<{ 
  prompt?: Prompt | null
  open: boolean
}>()

const emit = defineEmits(['update:open', 'refresh'])

const name = ref('')
const content = ref('')
const isActive = ref(false)

watch(() => props.prompt, (newPrompt) => {
  if (newPrompt) {
    name.value = newPrompt.name
    content.value = newPrompt.content
    isActive.value = newPrompt.is_active
  } else {
    name.value = ''
    content.value = ''
    isActive.value = false
  }
})

async function save() {
  const method = props.prompt ? 'PUT' : 'POST'
  const url = props.prompt ? `/api/admin/prompts/${props.prompt.id}` : '/api/admin/prompts'

  try {
    await $fetch(url, {
      method,
      body: {
        name: name.value,
        content: content.value,
        is_active: isActive.value,
      },
    })
    emit('refresh')
    emit('update:open', false)
  } catch (error) {
    console.error('Error saving prompt:', error)
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{ prompt ? 'Edit' : 'Create' }} Prompt</DialogTitle>
        <DialogDescription>
          {{ prompt ? 'Edit the details of your prompt.' : 'Create a new prompt from scratch.' }}
        </DialogDescription>
      </DialogHeader>
      <div class="grid gap-4 py-4">
        <div class="grid grid-cols-4 items-center gap-4">
          <label for="name" class="text-right">Name</label>
          <Input id="name" v-model="name" class="col-span-3" />
        </div>
        <div class="grid grid-cols-4 items-center gap-4">
          <label for="content" class="text-right">Content</label>
          <Textarea id="content" v-model="content" class="col-span-3" />
        </div>
        <div class="grid grid-cols-4 items-center gap-4">
          <label for="is_active" class="text-right">Active</label>
          <Checkbox id="is_active" v-model:checked="isActive" />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" @click="save">Save changes</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
