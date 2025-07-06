<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { Prompt } from '~/types/database.types'
import { columns as baseColumns } from '@/components/admin/prompts/columns'
import DataTable from '@/components/admin/DataTable.vue'
import PromptModal from '@/components/admin/prompts/PromptModal.vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/shadcn/button'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
} from '~/components/shadcn/sidebar';
import UserAuthStatus from '~/components/UserAuthStatus.vue';

definePageMeta({
  middleware: ['admin'],
})

const prompts = ref<Prompt[]>([])
const isModalOpen = ref(false)
const selectedPrompt = ref<Prompt | null>(null)

async function fetchPrompts() {
  try {
    prompts.value = await $fetch<Prompt[]>('/api/admin/prompts')
  } catch (error) {
    console.error('Error fetching prompts:', error)
    toast.error('Could not fetch prompts.')
  }
}

function openCreateModal() {
  selectedPrompt.value = null
  isModalOpen.value = true
}

function openEditModal(prompt: Prompt) {
  selectedPrompt.value = prompt
  isModalOpen.value = true
}

async function duplicatePrompt(id: string) {
  try {
    await $fetch('/api/admin/prompts/duplicate', {
      method: 'POST',
      body: { id },
    })
    await fetchPrompts()
    toast.success('Prompt duplicated successfully.')
  } catch (error) {
    console.error('Error duplicating prompt:', error)
    toast.error('Could not duplicate prompt.')
  }
}

async function deletePrompt(id: string) {
  if (!confirm('Are you sure you want to delete this prompt?')) return
  try {
    await $fetch(`/api/admin/prompts/${id}`, {
      method: 'DELETE',
    })
    await fetchPrompts()
    toast.success('Prompt deleted successfully.')
  } catch (error) {
    console.error('Error deleting prompt:', error)
    toast.error('Could not delete prompt.')
  }
}

const columns = computed(() => baseColumns({
  onEdit: openEditModal,
  onDuplicate: (prompt) => duplicatePrompt(prompt.id),
  onDelete: (prompt) => deletePrompt(prompt.id),
}))

onMounted(fetchPrompts)
</script>

<template>
  <SidebarProvider>
      <Sidebar>
        <SidebarContent>
          <SidebarHeader>
            <router-link to="/">
              <img src="/svg/logo_text.svg" alt="Synupsis Logo" class="h-8" />
            </router-link>
          </SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem to="/admin">
              Dashboard
            </SidebarMenuItem>
            <SidebarMenuItem to="/admin/prompts">
              Prompts
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <div class="flex-1 flex flex-col">
      <header class="flex w-full justify-between items-center py-6 px-8 border-b">
        <div class="ml-auto">
          <UserAuthStatus />
        </div>
      </header>
      <main class="p-4 sm:p-8">
        <div class="flex justify-between items-center mb-4">
          <h1 class="text-2xl font-bold">Prompts Management</h1>
          <Button @click="openCreateModal">Create Prompt</Button>
        </div>
        <DataTable :columns="columns" :data="prompts" />
        <PromptModal
          :open="isModalOpen"
          :prompt="selectedPrompt"
          @update:open="isModalOpen = $event"
          @refresh="fetchPrompts"
        />
      </main>
    </div>
  </SidebarProvider>
</template>
