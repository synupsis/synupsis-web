<script setup lang="ts">
const { t, locale } = useI18n();
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
  SidebarTrigger,
} from '~/components/shadcn/sidebar';
import UserAuthStatus from '~/components/UserAuthStatus.vue';
import { Textarea } from '~/components/shadcn/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/shadcn/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '~/components/shadcn/dialog';
import { defaultRecapPromptTemplate } from '~/lib/prompts/defaultPrompt';
import { getMissingRecapPromptVariables } from '~/lib/prompts/defaultPrompt';

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
    toast.error(t('Could not fetch prompts.'))
  }
}

async function saveActivePrompt() {
  if (!activePromptId.value) {
    toast.error(t('No active prompt to save.'))
    return
  }
  try {
    await $fetch(`/api/admin/prompts/${activePromptId.value}`, {
      method: 'PUT',
      body: { content: activePromptContent.value },
    })
    toast.success(t('Active prompt updated successfully.'))
    await fetchPrompts()
  } catch (error) {
    console.error('Error saving active prompt:', error)
    toast.error(t('Could not save active prompt.'))
  }
}

async function saveNewVersion() {
  try {
    await $fetch('/api/admin/prompts', {
      method: 'POST',
      body: { content: activePromptContent.value, is_active: true },
    })
    toast.success(t('New prompt version created and set as active.'))
    await fetchPrompts()
  } catch (error) {
    console.error('Error creating new version:', error)
    toast.error(t('Could not create new prompt version.'))
  }
}

async function activatePrompt(id: string) {
  try {
    await $fetch(`/api/admin/prompts/activate/${id}`, {
      method: 'POST',
    })
    toast.success(t('Prompt activated successfully.'))
    await fetchPrompts()
  } catch (error) {
    console.error('Error activating prompt:', error)
    toast.error(t('Could not activate prompt.'))
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
    toast.error(t('Could not fetch recaps.'))
  }
}

async function fetchPromptSettings() {
  isLoadingPromptSettings.value = true
  try {
    const { enabled } = await $fetch<{ enabled: boolean }>('/api/admin/prompts/settings')
    useDefaultPrompt.value = enabled
  } catch (error) {
    console.error('Error fetching prompt settings:', error)
    toast.error(t('Could not fetch prompt settings.'))
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
    toast.success(t(checked ? 'Default prompt enabled.' : 'Custom prompt editing re-enabled.'))
    if (!checked) {
      await fetchPrompts()
    }
  } catch (error) {
    console.error('Error updating default prompt setting:', error)
    useDefaultPrompt.value = previousValue
    toast.error(t('Could not update default prompt setting.'))
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
const missingPromptVariables = computed(() => getMissingRecapPromptVariables(activePromptContent.value))

onMounted(async () => {
  await fetchPromptSettings()
  await fetchPrompts()
})
</script>

<template>
  <SidebarProvider>
    <Sidebar>
      <SidebarHeader class="h-20 shrink-0 justify-center border-b border-sidebar-border px-5 py-0">
        <Logo display-text size="md" :aria-label="t('Synupsis home')" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem to="/admin">
            {{ t('Dashboard') }}
          </SidebarMenuItem>
          <SidebarMenuItem to="/admin/prompts">
            {{ t('Prompts') }}
          </SidebarMenuItem>
          <SidebarMenuItem to="/admin/corrections">
            {{ t('Corrections') }}
          </SidebarMenuItem>
          <SidebarMenuItem to="/admin/comments">
            {{ t('Reported comments') }}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-20 w-full shrink-0 items-center justify-between gap-3 border-b border-border px-5 sm:px-8">
        <SidebarTrigger class="size-10 rounded-xl text-muted-foreground hover:text-foreground focus-visible:ring-violet-400" />
        <nav :aria-label="t('Account')" class="ml-auto flex shrink-0 items-center">
          <UserAuthStatus />
        </nav>
      </header>
      <main class="px-5 py-8 sm:px-8">
        <h1 class="text-2xl font-bold mb-4">{{ t('Prompts Management') }}</h1>

        <div v-if="!isLoadingPromptSettings" class="mb-8">
          <h2 class="text-xl font-semibold mb-2">{{ t('Active Prompt') }}</h2>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {{ t('You can use variables in your prompt with the syntax') }} <code class="bg-gray-200 dark:bg-gray-700 px-1 rounded">&#123;&#123;variable&#125;&#125;</code>.
          </p>
          <div class="flex items-center gap-3 mb-4">
            <Switch
              id="use-default-prompt"
              :model-value="useDefaultPrompt"
              :disabled="isUpdatingDefaultPrompt"
              @update:modelValue="handleUseDefaultChange"
            />
            <label for="use-default-prompt" class="text-sm font-medium select-none">
              {{ t('Use default prompt') }}
            </label>
          </div>

          <div v-if="useDefaultPrompt" class="space-y-2">
            <p class="text-sm text-muted-foreground">
              {{ t('The hard-coded default prompt is currently in use. It is read-only and listed below for reference.') }}
            </p>
            <div class="p-4 border rounded-md bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 overflow-auto max-h-[60vh]">
              <pre class="whitespace-pre-wrap text-sm leading-relaxed"><code v-html="highlightedDefaultPrompt"></code></pre>
            </div>
          </div>
          <div v-else>
            <div
              v-if="missingPromptVariables.length"
              class="mb-4 rounded-md border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
            >
              {{ t('This prompt is incompatible with the recap v2 pipeline. The default prompt will be used. Missing variables:') }} <code>{{ missingPromptVariables.join(', ') }}</code>.
            </div>
            <Textarea v-model="activePromptContent" rows="10" class="w-full mb-4" />
            <div class="flex gap-2">
              <Button @click="saveActivePrompt">{{ t('Save Prompt') }}</Button>
              <Button @click="saveNewVersion" variant="outline">{{ t('Save This Version') }}</Button>
            </div>
          </div>
        </div>

        <div>
          <h2 class="text-xl font-semibold mb-2">{{ t('Prompt Versions') }}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{{ t('ID') }}</TableHead>
                <TableHead>{{ t('Created At') }}</TableHead>
                <TableHead>{{ t('Active') }}</TableHead>
                <TableHead>{{ t('Recaps Generated') }}</TableHead>
                <TableHead class="text-right">{{ t('Actions') }}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="prompt in promptVersions" :key="prompt.id">
                <TableCell class="font-medium">{{ prompt.id.substring(0, 8) }}...</TableCell>
                <TableCell>{{ new Date(prompt.created_at).toLocaleString(locale) }}</TableCell>
                <TableCell>{{ t(prompt.is_active ? 'Yes' : 'No') }}</TableCell>
                <TableCell>{{ prompt.recaps_count?.[0]?.count ?? 0 }}</TableCell>
                <TableCell class="text-right">
                  <Button variant="outline" size="sm" @click="viewPrompt(prompt.content)" class="mr-2">{{ t('View') }}</Button>
                  <Button variant="outline" size="sm" @click="viewRecaps(prompt.id)" class="mr-2">{{ t('View Recaps') }}</Button>
                  <Button v-if="!prompt.is_active" variant="outline" size="sm" @click="activatePrompt(prompt.id)">{{ t('Activate') }}</Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <Dialog :open="isViewModalOpen" @update:open="isViewModalOpen = $event">
          <DialogContent class="sm:max-w-[800px]">
            <DialogHeader>
              <DialogTitle>{{ t('Prompt Content') }}</DialogTitle>
              <DialogDescription>{{ t('Read-only view of the prompt content.') }}</DialogDescription>
            </DialogHeader>
            <div class="whitespace-pre-wrap p-4 border rounded-md bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 overflow-auto max-h-[60vh]" v-html="highlightedPromptContent">
            </div>
          </DialogContent>
        </Dialog>

        <Dialog :open="isRecapsModalOpen" @update:open="isRecapsModalOpen = $event">
          <DialogContent class="sm:max-w-[800px]">
            <DialogHeader>
              <DialogTitle>{{ t('Recaps for this Prompt') }}</DialogTitle>
              <DialogDescription>{{ t('List of recaps generated using this prompt version.') }}</DialogDescription>
            </DialogHeader>
            <div class="overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{{ t('ID') }}</TableHead>
                    <TableHead>{{ t('Show ID') }}</TableHead>
                    <TableHead>{{ t('Season ID') }}</TableHead>
                    <TableHead>{{ t('Created At') }}</TableHead>
                    <TableHead>{{ t('Status') }}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="recap in recapsList" :key="recap.id">
                    <TableCell class="font-medium">{{ recap.id.substring(0, 8) }}...</TableCell>
                    <TableCell>{{ recap.show_id.substring(0, 8) }}...</TableCell>
                    <TableCell>{{ recap.season_id.substring(0, 8) }}...</TableCell>
                    <TableCell>{{ new Date(recap.created_at).toLocaleString(locale) }}</TableCell>
                    <TableCell>{{ t(recap.status === 'published' ? 'Published' : 'Draft') }}</TableCell>
                  </TableRow>
                  <TableRow v-if="recapsList.length === 0">
                    <TableCell colspan="5" class="text-center">{{ t('No recaps found for this prompt.') }}</TableCell>
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
