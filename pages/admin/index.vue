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
        <h1 class="text-3xl font-bold mb-8">Admin Panel</h1>

        <!-- Stats Section -->
        <section class="mb-12">
          <h2 class="text-2xl font-semibold mb-4">Content Overview</h2>
          <div v-if="stats" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader><CardTitle>Total Shows</CardTitle></CardHeader>
              <CardContent><p class="text-4xl font-bold">{{ stats.shows }}</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Total Seasons</CardTitle></CardHeader>
              <CardContent><p class="text-4xl font-bold">{{ stats.seasons }}</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Published Recaps</CardTitle></CardHeader>
              <CardContent><p class="text-4xl font-bold">{{ stats.recaps.published }}</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Draft Recaps</CardTitle></CardHeader>
              <CardContent><p class="text-4xl font-bold">{{ stats.recaps.drafts }}</p></CardContent>
            </Card>
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card v-for="i in 4" :key="i" class="h-36 animate-pulse bg-muted" />
          </div>
        </section>

        <!-- Users Section -->
        <section>
          <h2 class="text-2xl font-semibold mb-4">User Management</h2>
          <div v-if="users">
            <DataTable :columns="columns" :data="users" :refresh="refreshUsers" />
          </div>
          <div v-else class="w-full h-64 bg-muted rounded-lg animate-pulse" />
        </section>
      </main>
    </div>
  </SidebarProvider>
</template>

<script lang="ts" setup>
import { Card, CardContent, CardHeader, CardTitle } from '~/components/shadcn/card';
import { columns } from '~/components/admin/columns';
import DataTable from '~/components/admin/DataTable.vue';
import UserAuthStatus from '~/components/UserAuthStatus.vue';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
} from '~/components/shadcn/sidebar';

definePageMeta({
  middleware: 'admin'
});

const { data: stats } = useFetch('/api/admin/content-stats');
const { data: users, refresh: refreshUsers } = useFetch('/api/admin/users');
</script>
