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
            <SidebarMenuItem to="/admin/slide-suggestions">
              {{ t('Slide suggestions') }}
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
        <h1 class="text-3xl font-bold mb-8">{{ t('Admin Panel') }}</h1>

        <!-- Stats Section -->
        <section class="mb-12">
          <h2 class="text-2xl font-semibold mb-4">{{ t('Content Overview') }}</h2>
          <div v-if="stats" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader><CardTitle>{{ t('Total Shows') }}</CardTitle></CardHeader>
              <CardContent><p class="text-4xl font-bold">{{ stats.shows }}</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{{ t('Total Seasons') }}</CardTitle></CardHeader>
              <CardContent><p class="text-4xl font-bold">{{ stats.seasons }}</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{{ t('Published Recaps') }}</CardTitle></CardHeader>
              <CardContent><p class="text-4xl font-bold">{{ stats.recaps.published }}</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{{ t('Draft Recaps') }}</CardTitle></CardHeader>
              <CardContent><p class="text-4xl font-bold">{{ stats.recaps.drafts }}</p></CardContent>
            </Card>
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card v-for="i in 4" :key="i" class="h-36 animate-pulse bg-muted" />
          </div>
        </section>

        <!-- Users Section -->
        <section>
          <h2 class="text-2xl font-semibold mb-4">{{ t('User Management') }}</h2>
          <div v-if="users">
            <DataTable :columns="columns" :data="users" @refresh="refreshUsers" />
          </div>
          <div v-else class="w-full h-64 bg-muted rounded-lg animate-pulse" />
        </section>
      </main>
    </div>
  </SidebarProvider>
</template>

<script lang="ts" setup>
const { t } = useI18n();
import { Card, CardContent, CardHeader, CardTitle } from '~/components/shadcn/card';
import { createUserColumns } from '~/components/admin/columns';
import type { User } from '~/components/admin/columns';
import DataTable from '~/components/admin/DataTable.vue';
import UserAuthStatus from '~/components/UserAuthStatus.vue';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '~/components/shadcn/sidebar';

definePageMeta({
  middleware: 'admin'
});

const columns = computed(() => createUserColumns(t));

const { data: stats } = useFetch('/api/admin/content-stats');
const { data: users, refresh: refreshUsers } = useFetch<User[]>('/api/admin/users');
</script>
