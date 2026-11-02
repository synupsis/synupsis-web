<template>
  <ClientOnly>
    <div v-if="user" class="flex shrink-0 items-center justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            variant="ghost"
            :aria-label="t('Open account menu for {name}', { name: displayName })"
            class="flex h-10 w-10 items-center gap-2 rounded-xl border border-transparent p-1 text-foreground transition-colors hover:border-border hover:bg-muted/70 focus-visible:ring-foreground data-[state=open]:border-border data-[state=open]:bg-muted/70 sm:w-auto sm:pl-1 sm:pr-3"
          >
            <Avatar class="size-8 shrink-0 border border-foreground/20">
              <AvatarImage v-if="avatarUrl" :src="avatarUrl" alt="" />
              <AvatarFallback class="flex size-full items-center justify-center bg-foreground/10 text-sm font-semibold text-foreground">
                {{ displayName.charAt(0).toUpperCase() }}
              </AvatarFallback>
            </Avatar>
            <span class="hidden max-w-40 truncate text-sm font-medium sm:block" :title="displayName">{{ displayName }}</span>
            <ChevronDown class="hidden size-3.5 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-56">
          <DropdownMenuLabel class="truncate text-sm text-foreground" :title="displayName">{{ displayName }}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem as-child>
            <NuxtLink to="/profile">
              <UserRound aria-hidden="true" />
              {{ t('Profile') }}
            </NuxtLink>
          </DropdownMenuItem>
          <DropdownMenuItem as-child>
            <NuxtLink to="/library">
              <LibraryBig aria-hidden="true" />
              {{ t('Library') }}
            </NuxtLink>
          </DropdownMenuItem>
          <DropdownMenuItem v-if="isAdmin" as-child class="min-h-10 cursor-pointer rounded-lg px-3 py-2.5">
            <NuxtLink to="/admin">
              <ShieldCheck aria-hidden="true" />
              {{ t('Admin Panel') }}
            </NuxtLink>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            class="text-red-300 data-[highlighted]:bg-red-500/10 data-[highlighted]:text-red-200"
            @click="logout"
          >
            <LogOut aria-hidden="true" />
            {{ t('Log out') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div v-else class="flex shrink-0 items-center justify-end gap-1 sm:gap-2">
      <Button
        as-child
        variant="ghost"
        class="h-10 rounded-xl px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground focus-visible:ring-foreground sm:px-3 sm:text-sm"
      >
        <NuxtLink to="/login">{{ t('Log in') }}</NuxtLink>
      </Button>
      <Button
        as-child
        class="h-10 rounded-xl bg-foreground px-3 text-xs font-semibold text-background transition-colors hover:bg-foreground/85 focus-visible:ring-foreground sm:px-4 sm:text-sm"
      >
        <NuxtLink to="/signup">{{ t('Sign up') }}</NuxtLink>
      </Button>
    </div>
    <template #fallback>
      <div class="flex h-10 w-32 shrink-0 items-center justify-end gap-1 sm:w-[154px] sm:gap-2" role="status" :aria-label="t('Loading account')">
        <span class="h-8 w-12 rounded-lg bg-muted/50" aria-hidden="true" />
        <span class="h-10 w-[72px] rounded-xl bg-muted/70" aria-hidden="true" />
      </div>
    </template>
  </ClientOnly>
</template>

<script lang="ts" setup>
const { t } = useI18n();
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
import { ChevronDown, LibraryBig, LogOut, ShieldCheck, UserRound } from 'lucide-vue-next';

const user = useSupabaseUser();
const supabase = useSupabaseClient();
const isAdmin = useIsAdmin();
const userMetadata = computed<Record<string, unknown>>(() => user.value?.user_metadata ?? {});
const displayName = computed(() => {
  const username = userMetadata.value.username;
  return typeof username === 'string' && username ? username : (user.value?.email ?? t('User'));
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
