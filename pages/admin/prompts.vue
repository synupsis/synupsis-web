<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { Prompt, Recap } from '~/types/database.types'
import { toast } from 'vue-sonner'
import { Button } from '@/components/shadcn/button'
import { Switch } from '@/components/shadcn/switch'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
} from '~/components/shadcn/sidebar';
import UserAuthStatus from '~/components/UserAuthStatus.vue';
import { Textarea } from '~/components/shadcn/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/shadcn/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '~/components/shadcn/dialog';
import { defaultRecapPromptTemplate } from '~/lib/prompts/defaultPrompt';

definePageMeta({
  middleware: ['admin'],
})

const activePromptContent = ref<string>('')
const activePromptId = ref<string | null>(null)
const promptVersions = ref<Prompt[]>([])
const viewingPromptContent = ref<string | null>(null)
const isViewModalOpen = ref(false)
const recapsList = ref<Recap[]>([])
const isRecapsModalOpen = ref(false)
const useDefaultPrompt = ref(false)
const isLoadingPromptSettings = ref(true)
const isUpdatingDefaultPrompt = ref(false)

async function fetchPrompts() {
  try {
    const allPrompts = await $fetch<Prompt[]>('/api/admin/prompts')
    promptVersions.value = allPrompts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const active = allPrompts.find(p => p.is_active)
    if (active) {
      activePromptContent.value = active.content
      activePromptId.value = active.id
    } else if (allPrompts.length > 0 && !useDefaultPrompt.value) {
      // If no active prompt, set the latest one as active (or first if no created_at)
      const latestPrompt = promptVersions.value[0];
      if (latestPrompt) {
        await activatePrompt(latestPrompt.id);
        activePromptContent.value = latestPrompt.content;
        activePromptId.value = latestPrompt.id;
      }
    }
  } catch (error) {
    console.error('Error fetching prompts:', error)
    toast.error('Could not fetch prompts.')
  }
}

async function saveActivePrompt() {
  if (!activePromptId.value) {
    toast.error('No active prompt to save.')
    return
  }
  try {
    await $fetch(`/api/admin/prompts/${activePromptId.value}`, {
      method: 'PUT',
      body: { content: activePromptContent.value },
    })
    toast.success('Active prompt updated successfully.')
    await fetchPrompts()
  } catch (error) {
    console.error('Error saving active prompt:', error)
    toast.error('Could not save active prompt.')
  }
}

async function saveNewVersion() {
  try {
    await $fetch('/api/admin/prompts', {
      method: 'POST',
      body: { content: activePromptContent.value, is_active: true },
    })
    toast.success('New prompt version created and set as active.')
    await fetchPrompts()
  } catch (error) {
    console.error('Error creating new version:', error)
    toast.error('Could not create new prompt version.')
  }
}

async function activatePrompt(id: string) {
  try {
    await $fetch(`/api/admin/prompts/activate/${id}`, {
      method: 'POST',
    })
    toast.success('Prompt activated successfully.')
    await fetchPrompts()
  } catch (error) {
    console.error('Error activating prompt:', error)
    toast.error('Could not activate prompt.')
  }
}

function viewPrompt(content: string) {
  viewingPromptContent.value = content
  isViewModalOpen.value = true
}

async function viewRecaps(promptId: string) {
  try {
    recapsList.value = await $fetch<Recap[]>(`/api/admin/prompts/${promptId}/recaps`)
    isRecapsModalOpen.value = true
  } catch (error) {
    console.error('Error fetching recaps:', error)
    toast.error('Could not fetch recaps.')
  }
}

async function fetchPromptSettings() {
  isLoadingPromptSettings.value = true
  try {
    const { enabled } = await $fetch<{ enabled: boolean }>('/api/admin/prompts/settings')
    useDefaultPrompt.value = enabled
  } catch (error) {
    console.error('Error fetching prompt settings:', error)
    toast.error('Could not fetch prompt settings.')
  } finally {
    isLoadingPromptSettings.value = false
  }
}

async function handleUseDefaultChange(checked: boolean) {
  if (isUpdatingDefaultPrompt.value) return
  const previousValue = useDefaultPrompt.value
  useDefaultPrompt.value = checked
  isUpdatingDefaultPrompt.value = true

  try {
    await $fetch('/api/admin/prompts/settings', {
      method: 'PUT',
      body: { enabled: checked },
    })
    toast.success(checked ? 'Default prompt enabled.' : 'Custom prompt editing re-enabled.')
    if (!checked) {
      await fetchPrompts()
    }
  } catch (error) {
    console.error('Error updating default prompt setting:', error)
    useDefaultPrompt.value = previousValue
    toast.error('Could not update default prompt setting.')
  } finally {
    isUpdatingDefaultPrompt.value = false
  }
}

const highlightVariables = (text: string | null) => {
  if (!text) return ''
  return text.replace(/\{\{([^}]+)\}\}/g, '<span class="bg-yellow-200 dark:bg-yellow-700 text-yellow-900 dark:text-yellow-100 px-1 rounded">&#123;&#123;$1&#125;&#125;</span>')
}

const highlightedPromptContent = computed(() => highlightVariables(viewingPromptContent.value))
const highlightedDefaultPrompt = computed(() => highlightVariables(defaultRecapPromptTemplate))

onMounted(async () => {
  await fetchPromptSettings()
  await fetchPrompts()
})
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
        <h1 class="text-2xl font-bold mb-4">Prompts Management</h1>

        <div v-if="!isLoadingPromptSettings" class="mb-8">
          <h2 class="text-xl font-semibold mb-2">Active Prompt</h2>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
            You can use variables in your prompt with the syntax <code class="bg-gray-200 dark:bg-gray-700 px-1 rounded">&#123;&#123;variable&#125;&#125;</code>.
          </p>
          <div class="flex items-center gap-3 mb-4">
            <Switch
              id="use-default-prompt"
              :model-value="useDefaultPrompt"
              :disabled="isUpdatingDefaultPrompt"
              @update:modelValue="handleUseDefaultChange"
            />
            <label for="use-default-prompt" class="text-sm font-medium select-none">
              Use default prompt
            </label>
          </div>

          <div v-if="useDefaultPrompt" class="space-y-2">
            <p class="text-sm text-muted-foreground">
              The hard-coded default prompt is currently in use. It is read-only and listed below for reference.
            </p>
            <div class="p-4 border rounded-md bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 overflow-auto max-h-[60vh]">
              <pre class="whitespace-pre-wrap text-sm leading-relaxed"><code v-html="highlightedDefaultPrompt"></code></pre>
            </div>
          </div>
          <div v-else>
            <Textarea v-model="activePromptContent" rows="10" class="w-full mb-4" />
            <div class="flex gap-2">
              <Button @click="saveActivePrompt">Save Prompt</Button>
              <Button @click="saveNewVersion" variant="outline">Save This Version</Button>
            </div>
          </div>
        </div>

        <div>
          <h2 class="text-xl font-semibold mb-2">Prompt Versions</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Recaps Generated</TableHead>
                <TableHead class="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="prompt in promptVersions" :key="prompt.id">
                <TableCell class="font-medium">{{ prompt.id.substring(0, 8) }}...</TableCell>
                <TableCell>{{ new Date(prompt.created_at).toLocaleString() }}</TableCell>
                <TableCell>{{ prompt.is_active ? 'Yes' : 'No' }}</TableCell>
                <TableCell>{{ prompt.recaps_count?.[0]?.count ?? 0 }}</TableCell>
                <TableCell class="text-right">
                  <Button variant="outline" size="sm" @click="viewPrompt(prompt.content)" class="mr-2">View</Button>
                  <Button variant="outline" size="sm" @click="viewRecaps(prompt.id)" class="mr-2">View Recaps</Button>
                  <Button v-if="!prompt.is_active" variant="outline" size="sm" @click="activatePrompt(prompt.id)">Activate</Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <Dialog :open="isViewModalOpen" @update:open="isViewModalOpen = $event">
          <DialogContent class="sm:max-w-[800px]">
            <DialogHeader>
              <DialogTitle>Prompt Content</DialogTitle>
              <DialogDescription>Read-only view of the prompt content.</DialogDescription>
            </DialogHeader>
            <div class="whitespace-pre-wrap p-4 border rounded-md bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 overflow-auto max-h-[60vh]" v-html="highlightedPromptContent">
            </div>
          </DialogContent>
        </Dialog>

        <Dialog :open="isRecapsModalOpen" @update:open="isRecapsModalOpen = $event">
          <DialogContent class="sm:max-w-[800px]">
            <DialogHeader>
              <DialogTitle>Recaps for this Prompt</DialogTitle>
              <DialogDescription>List of recaps generated using this prompt version.</DialogDescription>
            </DialogHeader>
            <div class="overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Show ID</TableHead>
                    <TableHead>Season ID</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="recap in recapsList" :key="recap.id">
                    <TableCell class="font-medium">{{ recap.id.substring(0, 8) }}...</TableCell>
                    <TableCell>{{ recap.show_id.substring(0, 8) }}...</TableCell>
                    <TableCell>{{ recap.season_id.substring(0, 8) }}...</TableCell>
                    <TableCell>{{ new Date(recap.created_at).toLocaleString() }}</TableCell>
                    <TableCell>{{ recap.status }}</TableCell>
                  </TableRow>
                  <TableRow v-if="recapsList.length === 0">
                    <TableCell colspan="5" class="text-center">No recaps found for this prompt.</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  </SidebarProvider>
</template>
