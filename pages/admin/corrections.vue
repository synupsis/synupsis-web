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
          <h1 class="text-2xl font-bold">{{ t('Community corrections') }}</h1>
          <p class="mt-2 text-sm text-muted-foreground">{{ t('Votes prioritize the queue, but changes are only published after your approval.') }}</p>
        </div>
        <div v-if="pending" class="grid min-h-64 place-items-center"><SpinLoader class="h-7 w-7" /></div>
        <div v-else-if="corrections?.length" class="space-y-5">
          <Card v-for="correction in corrections" :key="correction.id">
            <CardHeader>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle class="text-lg">{{ correction.season.showName }} · {{ t('Season {number}', { number: correction.season.number ?? '?' }) }}</CardTitle>
                  <CardDescription class="mt-1">{{ correction.targetType }} / {{ correction.targetKey }} / {{ correction.field }} · {{ t('Visible from episode {number}', { number: correction.revealEpisode }) }}</CardDescription>
                </div>
                <Badge :variant="correction.score >= 0 ? 'secondary' : 'destructive'">{{ t('Score {score}', { score: correction.score }) }}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div class="grid gap-4 md:grid-cols-2">
                <div class="rounded-lg border border-red-500/20 bg-red-500/5 p-4"><p class="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{{ t('Current information') }}</p><p class="text-sm leading-6">{{ correction.currentValue }}</p></div>
                <div class="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4"><p class="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{{ t('Proposal') }}</p><p class="text-sm leading-6">{{ correction.proposedValue }}</p></div>
              </div>
              <div class="mt-4 rounded-lg bg-muted/40 p-4"><p class="text-xs uppercase tracking-wide text-muted-foreground">{{ t('Reason') }}</p><p class="mt-2 text-sm leading-6">{{ correction.reason }}</p><a v-if="correction.sourceUrl" :href="correction.sourceUrl" target="_blank" rel="noopener noreferrer" class="mt-2 inline-block text-sm text-primary hover:underline">{{ t('Open source') }}</a></div>
              <div class="mt-5 flex justify-end gap-3">
                <Button variant="outline" :disabled="reviewingId === correction.id" @click="review(correction.id, 'rejected')">{{ t('Reject') }}</Button>
                <Button :disabled="reviewingId === correction.id" @click="review(correction.id, 'accepted')">{{ t('Approve and publish') }}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card v-else class="border-dashed p-12 text-center text-muted-foreground">{{ t('The correction queue is empty.') }}</Card>
      </main>
    </div>
  </SidebarProvider>
</template>

<script setup lang="ts">
const { t } = useI18n();
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

type AdminCorrection = {
  id: string;
  targetType: string;
  targetKey: string;
  field: string;
  currentValue: unknown;
  proposedValue: unknown;
  reason: string;
  sourceUrl: string | null;
  revealEpisode: number;
  score: number;
  season: { number: number | null; showName: string; showTraktId: number | null };
};

definePageMeta({ middleware: 'admin' });
const { data: corrections, pending, refresh } = await useFetch<AdminCorrection[]>('/api/admin/corrections');
const reviewingId = ref<string | null>(null);

async function review(id: string, decision: 'accepted' | 'rejected') {
  reviewingId.value = id;
  try {
    await $fetch(`/api/admin/corrections/${id}/review`, { method: 'POST', body: { decision } });
    toast.success(t(decision === 'accepted' ? 'Correction published.' : 'Correction rejected.'));
    await refresh();
  } catch (cause: any) {
    toast.error(t('Could not complete this review.'), { description: t('Please try again.') });
  } finally {
    reviewingId.value = null;
  }
}
</script>
