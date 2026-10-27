<template>
  <ClientOnly>
    <div v-if="user" class="flex shrink-0 items-center justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            variant="ghost"
            :aria-label="`Open account menu for ${displayName}`"
            class="flex h-10 w-10 items-center gap-2 rounded-xl border border-transparent p-1 text-foreground transition-colors hover:border-border hover:bg-muted/70 focus-visible:ring-violet-400 data-[state=open]:border-border data-[state=open]:bg-muted/70 sm:w-auto sm:pl-1 sm:pr-3"
          >
            <Avatar class="size-8 shrink-0 border border-violet-400/20">
              <AvatarImage v-if="avatarUrl" :src="avatarUrl" alt="" />
              <AvatarFallback class="flex size-full items-center justify-center bg-violet-500/15 text-sm font-semibold text-violet-700 dark:text-violet-200">
                {{ displayName.charAt(0).toUpperCase() }}
              </AvatarFallback>
            </Avatar>
            <span class="hidden max-w-40 truncate text-sm font-medium sm:block" :title="displayName">{{ displayName }}</span>
            <ChevronDown class="hidden size-3.5 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          :side-offset="8"
          class="w-56 max-w-[calc(100vw-2rem)] rounded-2xl border-border bg-popover/95 p-1.5 shadow-xl shadow-black/20 backdrop-blur-xl"
        >
          <DropdownMenuLabel class="truncate px-3 py-2 text-sm font-medium" :title="displayName">{{ displayName }}</DropdownMenuLabel>
          <DropdownMenuSeparator class="mx-1 my-1" />
          <DropdownMenuItem as-child class="min-h-10 cursor-pointer rounded-lg px-3 py-2.5">
            <NuxtLink to="/profile">
              <UserRound class="text-muted-foreground" aria-hidden="true" />
              Profile
            </NuxtLink>
          </DropdownMenuItem>
          <DropdownMenuItem v-if="isAdmin" as-child class="min-h-10 cursor-pointer rounded-lg px-3 py-2.5">
            <NuxtLink to="/admin">
              <ShieldCheck class="text-muted-foreground" aria-hidden="true" />
              Admin Panel
            </NuxtLink>
          </DropdownMenuItem>
          <DropdownMenuSeparator class="mx-1 my-1" />
          <DropdownMenuItem
            class="min-h-10 cursor-pointer rounded-lg px-3 py-2.5 text-red-600 focus:bg-red-500/10 focus:text-red-600 dark:text-red-300 dark:focus:text-red-300"
            @click="logout"
          >
            <LogOut aria-hidden="true" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div v-else class="flex shrink-0 items-center justify-end gap-1 sm:gap-2">
      <Button
        as-child
        variant="ghost"
        class="h-10 rounded-xl px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground focus-visible:ring-violet-400 sm:px-3 sm:text-sm"
      >
        <NuxtLink to="/login">Log in</NuxtLink>
      </Button>
      <Button
        as-child
        class="h-10 rounded-xl border border-violet-400/20 bg-violet-500 px-3 text-xs font-semibold text-white shadow-sm shadow-violet-950/20 transition-colors hover:bg-violet-400 focus-visible:ring-violet-400 sm:px-4 sm:text-sm"
      >
        <NuxtLink to="/signup">Sign up</NuxtLink>
      </Button>
    </div>
    <template #fallback>
      <div class="flex h-10 w-32 shrink-0 items-center justify-end gap-1 sm:w-[154px] sm:gap-2" role="status" aria-label="Loading account">
        <span class="h-8 w-12 rounded-lg bg-muted/50" aria-hidden="true" />
        <span class="h-10 w-[72px] rounded-xl bg-muted/70" aria-hidden="true" />
      </div>
    </template>
  </ClientOnly>
</template>

<script lang="ts" setup>
import { Button } from '~/components/shadcn/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/shadcn/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/shadcn/avatar'
import { ChevronDown, LogOut, ShieldCheck, UserRound } from 'lucide-vue-next';

const user = useSupabaseUser();
const supabase = useSupabaseClient();
const isAdmin = useIsAdmin();
const userMetadata = computed<Record<string, unknown>>(() => user.value?.user_metadata ?? {});
const displayName = computed(() => {
  const username = userMetadata.value.username;
  return typeof username === 'string' && username ? username : (user.value?.email ?? 'User');
});
const avatarUrl = computed(() => {
  const value = userMetadata.value.avatar_url;
  return typeof value === 'string' ? value : '';
});

async function logout() {
  await supabase.auth.signOut();
  await navigateTo('/');
}
</script>
