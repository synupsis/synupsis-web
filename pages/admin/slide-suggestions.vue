<template>
  <SidebarProvider>
    <Sidebar>
      <SidebarHeader class="h-20 shrink-0 justify-center border-b border-sidebar-border px-5 py-0">
        <Logo display-text size="md" :aria-label="t('Synupsis home')" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem to="/admin">{{ t('Dashboard') }}</SidebarMenuItem>
          <SidebarMenuItem to="/admin/prompts">{{ t('Prompts') }}</SidebarMenuItem>
          <SidebarMenuItem to="/admin/corrections">{{ t('Corrections') }}</SidebarMenuItem>
          <SidebarMenuItem to="/admin/comments">{{ t('Reported comments') }}</SidebarMenuItem>
          <SidebarMenuItem to="/admin/slide-suggestions">{{ t('Slide suggestions') }}</SidebarMenuItem>
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
        <div class="mb-8">
          <h1 class="text-2xl font-bold">{{ t('Slide suggestions') }}</h1>
          <p class="mt-2 text-sm text-muted-foreground">{{ t('Corrections and new slides suggested on recaps. Accepting one only marks it as accepted: the recap itself is edited separately.') }}</p>
        </div>
        <div v-if="pending" class="grid min-h-64 place-items-center"><SpinLoader class="h-7 w-7" /></div>
        <div v-else-if="suggestions?.length" class="space-y-5">
          <Card v-for="suggestion in suggestions" :key="suggestion.id">
            <CardHeader>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle class="text-lg">{{ suggestion.recap.showName }} · {{ t('Season {number}', { number: suggestion.recap.seasonNumber ?? '?' }) }}<span v-if="suggestion.recap.locale" class="ml-2 text-sm font-normal uppercase text-muted-foreground">{{ suggestion.recap.locale }}</span></CardTitle>
                  <CardDescription class="mt-1">
                    {{ suggestion.kind === 'add' ? t('New slide after slide {number}', { number: suggestion.slideOrder }) : t('Slide {number}', { number: suggestion.slideOrder }) }}
                    <template v-if="suggestion.slideContext.kind"> · {{ suggestion.slideContext.kind }}</template>
                    <template v-if="suggestion.fieldPath"> · {{ suggestion.fieldPath }}</template>
                    <template v-if="suggestion.authorName"> · {{ suggestion.authorName }}</template>
                  </CardDescription>
                </div>
                <div class="flex items-center gap-2">
                  <Badge variant="secondary" class="gap-1 tabular-nums"><ThumbsUpIcon class="h-3.5 w-3.5" aria-hidden="true" />{{ suggestion.likeCount }}</Badge>
                  <Button variant="outline" size="sm" as-child>
                    <NuxtLink :to="`/recap/${suggestion.recap.id}/edit`">{{ t('Open the recap editor') }}</NuxtLink>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div v-if="suggestion.kind === 'text'" class="grid gap-4 md:grid-cols-2">
                <div class="rounded-lg border border-red-500/20 bg-red-500/5 p-4"><p class="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{{ t('Current text') }}</p><p class="text-sm leading-6">{{ suggestion.currentValue }}</p></div>
                <div class="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4"><p class="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{{ t('Proposal') }}</p><p class="text-sm leading-6">{{ suggestion.proposedValue }}</p></div>
              </div>
              <div v-else-if="suggestion.slideContext.summary" class="rounded-lg border border-white/10 bg-muted/30 p-4">
                <p class="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{{ t('Slide as seen') }}</p>
                <p class="text-sm leading-6">{{ suggestion.slideContext.summary }}</p>
              </div>
              <div v-if="suggestion.message" class="mt-4 rounded-lg bg-muted/40 p-4">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ suggestion.kind === 'text' ? t('Reason') : t('Suggestion') }}</p>
                <p class="mt-2 whitespace-pre-line text-sm leading-6">{{ suggestion.message }}</p>
              </div>
              <div class="mt-5 flex justify-end gap-3">
                <Button variant="outline" :disabled="reviewingId === suggestion.id" @click="review(suggestion.id, 'rejected')">{{ t('Reject') }}</Button>
                <Button :disabled="reviewingId === suggestion.id" @click="review(suggestion.id, 'accepted')">{{ t('Accept') }}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card v-else class="border-dashed p-12 text-center text-muted-foreground">{{ t('No slide suggestions are waiting.') }}</Card>
      </main>
    </div>
  </SidebarProvider>
</template>

<script setup lang="ts">
const { t } = useI18n();
import { ThumbsUpIcon } from 'lucide-vue-next';
import { ref } from 'vue';
import { toast } from 'vue-sonner';
import { Badge } from '~/components/shadcn/badge';
import { Button } from '~/components/shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/shadcn/card';
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from '~/components/shadcn/sidebar';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import UserAuthStatus from '~/components/UserAuthStatus.vue';
import type { AdminRecapSlideSuggestion } from '~/types/recap-slide-suggestion.types';

definePageMeta({ middleware: 'admin' });
const { data: suggestions, pending, refresh } = await useFetch<AdminRecapSlideSuggestion[]>('/api/admin/slide-suggestions');
const reviewingId = ref<string | null>(null);

async function review(id: string, decision: 'accepted' | 'rejected') {
  reviewingId.value = id;
  try {
    await $fetch(`/api/admin/slide-suggestions/${id}/review`, { method: 'POST', body: { decision } });
    toast.success(t(decision === 'accepted' ? 'Suggestion accepted.' : 'Suggestion rejected.'));
    await refresh();
  } catch {
    toast.error(t('Could not complete this review.'), { description: t('Please try again.') });
  } finally {
    reviewingId.value = null;
  }
}
</script>
