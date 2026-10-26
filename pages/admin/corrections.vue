<template>
  <SidebarProvider>
    <Sidebar>
      <SidebarContent>
        <SidebarHeader><NuxtLink to="/"><img src="/svg/logo_text.svg" alt="Synupsis" class="h-8" /></NuxtLink></SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem to="/admin">Dashboard</SidebarMenuItem>
          <SidebarMenuItem to="/admin/prompts">Prompts</SidebarMenuItem>
          <SidebarMenuItem to="/admin/corrections">Corrections</SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
    <div class="flex flex-1 flex-col">
      <header class="flex w-full items-center justify-between border-b px-8 py-6">
        <div><h1 class="text-2xl font-bold">Corrections communautaires</h1><p class="mt-1 text-sm text-muted-foreground">Les votes priorisent la file, mais seule votre validation publie un changement.</p></div>
        <UserAuthStatus />
      </header>
      <main class="p-4 sm:p-8">
        <div v-if="pending" class="grid min-h-64 place-items-center"><SpinLoader class="h-7 w-7" /></div>
        <div v-else-if="corrections?.length" class="space-y-5">
          <Card v-for="correction in corrections" :key="correction.id">
            <CardHeader>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle class="text-lg">{{ correction.season.showName }} · Saison {{ correction.season.number }}</CardTitle>
                  <CardDescription class="mt-1">{{ correction.targetType }} / {{ correction.targetKey }} / {{ correction.field }} · visible dès l’épisode {{ correction.revealEpisode }}</CardDescription>
                </div>
                <Badge :variant="correction.score >= 0 ? 'secondary' : 'destructive'">Score {{ correction.score }}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div class="grid gap-4 md:grid-cols-2">
                <div class="rounded-lg border border-red-500/20 bg-red-500/5 p-4"><p class="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Information actuelle</p><p class="text-sm leading-6">{{ correction.currentValue }}</p></div>
                <div class="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4"><p class="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Proposition</p><p class="text-sm leading-6">{{ correction.proposedValue }}</p></div>
              </div>
              <div class="mt-4 rounded-lg bg-muted/40 p-4"><p class="text-xs uppercase tracking-wide text-muted-foreground">Justification</p><p class="mt-2 text-sm leading-6">{{ correction.reason }}</p><a v-if="correction.sourceUrl" :href="correction.sourceUrl" target="_blank" rel="noopener noreferrer" class="mt-2 inline-block text-sm text-primary hover:underline">Ouvrir la source</a></div>
              <div class="mt-5 flex justify-end gap-3">
                <Button variant="outline" :disabled="reviewingId === correction.id" @click="review(correction.id, 'rejected')">Rejeter</Button>
                <Button :disabled="reviewingId === correction.id" @click="review(correction.id, 'accepted')">Valider et publier</Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card v-else class="border-dashed p-12 text-center text-muted-foreground">La file de corrections est vide.</Card>
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
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarProvider,
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
    toast.success(decision === 'accepted' ? 'La correction est publiée.' : 'La correction est rejetée.');
    await refresh();
  } catch (cause: any) {
    toast.error('Impossible de terminer cette revue.', { description: cause.data?.statusMessage || cause.message });
  } finally {
    reviewingId.value = null;
  }
}
</script>
