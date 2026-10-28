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
          <h1 class="text-2xl font-bold">{{ t('Reported comments') }}</h1>
          <p class="mt-2 text-sm text-muted-foreground">{{ t('Viewers report comments; delete the ones that break the rules, keep the others.') }}</p>
        </div>
        <div v-if="pending" class="grid min-h-64 place-items-center"><SpinLoader class="h-7 w-7" /></div>
        <div v-else-if="comments?.length" class="space-y-5">
          <Card v-for="comment in comments" :key="comment.id">
            <CardHeader>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle class="text-lg">{{ comment.show.name }} · S{{ comment.season }}E{{ comment.episode }}</CardTitle>
                  <CardDescription class="mt-1">{{ comment.authorName || t('A viewer') }} · {{ new Date(comment.createdAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) }}</CardDescription>
                </div>
                <Badge variant="destructive">{{ comment.reportCount > 1 ? t('{count} reports', { count: comment.reportCount }) : t('{count} report', { count: comment.reportCount }) }}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p class="whitespace-pre-line break-words rounded-lg bg-muted/40 p-4 text-sm leading-6">{{ comment.body }}</p>
              <div class="mt-5 flex justify-end gap-3">
                <Button variant="outline" :disabled="actingId === comment.id" @click="moderate(comment.id, 'dismiss')">{{ t('Keep') }}</Button>
                <Button variant="destructive" :disabled="actingId === comment.id" @click="moderate(comment.id, 'delete')">{{ t('Delete') }}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card v-else class="border-dashed p-12 text-center text-muted-foreground">{{ t('No reported comments.') }}</Card>
      </main>
    </div>
  </SidebarProvider>
</template>

<script setup lang="ts">
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
import type { ReportedEpisodeComment } from '~/types/episode-comment.types';

const { t, locale } = useI18n();

definePageMeta({ middleware: 'admin' });
const { data: comments, pending } = await useFetch<ReportedEpisodeComment[]>('/api/admin/comments');
const actingId = ref<string | null>(null);

async function moderate(id: string, action: 'delete' | 'dismiss') {
  actingId.value = id;
  try {
    if (action === 'delete') await $fetch(`/api/admin/comments/${id}`, { method: 'DELETE' });
    else await $fetch(`/api/admin/comments/${id}/dismiss`, { method: 'POST' });
    comments.value = (comments.value ?? []).filter(comment => comment.id !== id);
    toast.success(t(action === 'delete' ? 'Comment deleted.' : 'Reports dismissed.'));
  } catch {
    toast.error(t('Could not complete this action.'));
  } finally {
    actingId.value = null;
  }
}
</script>
