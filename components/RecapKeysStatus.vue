<template>
  <ClientOnly>
    <DropdownMenu v-if="user && wallet">
      <DropdownMenuTrigger as-child>
        <Button
          variant="ghost"
          :aria-label="triggerLabel"
          class="flex h-10 items-center gap-1.5 rounded-xl border border-transparent px-2.5 text-foreground transition-colors hover:border-border hover:bg-muted/70 focus-visible:ring-violet-400 data-[state=open]:border-border data-[state=open]:bg-muted/70"
        >
          <TicketIcon class="h-4 w-4 text-primary" aria-hidden="true" />
          <span class="text-sm font-semibold tabular-nums">{{ wallet.unlimited ? '∞' : wallet.keys }}</span>
          <!-- A recap being prepared: its own small ring, beside the tickets. -->
          <template v-if="current">
            <span class="mx-0.5 h-4 w-px bg-white/15" aria-hidden="true" />
            <svg class="h-4 w-4 -rotate-90" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" :r="RING_RADIUS" fill="none" stroke-width="2" class="stroke-amber-400/20" />
              <circle
                cx="8"
                cy="8"
                :r="RING_RADIUS"
                fill="none"
                stroke-width="2"
                stroke-linecap="round"
                class="stroke-amber-400 transition-[stroke-dashoffset] duration-700"
                :stroke-dasharray="RING_CIRCUMFERENCE"
                :stroke-dashoffset="RING_CIRCUMFERENCE * (1 - current.progress / 100)"
              />
            </svg>
            <span class="hidden text-xs font-semibold tabular-nums text-amber-300 sm:inline">{{ current.progress }} %</span>
          </template>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        :side-offset="8"
        class="w-72 max-w-[calc(100vw-2rem)] rounded-2xl border-border bg-popover/95 p-3 shadow-xl shadow-black/20 backdrop-blur-xl"
      >
        <RecapTicketsBalance :wallet="wallet" compact class="px-1" />

        <template v-if="running.length">
          <DropdownMenuSeparator class="my-3" />
          <p class="px-1 text-xs font-medium text-muted-foreground">{{ t('Being prepared') }}</p>
          <DropdownMenuItem
            v-for="recap in running"
            :key="recap.id"
            as-child
            class="mt-1 block cursor-pointer rounded-xl px-2 py-2"
          >
            <NuxtLink :to="recap.showPath ?? '/'">
              <span class="flex items-baseline justify-between gap-3 text-sm">
                <span class="min-w-0 truncate font-medium">{{ recap.showName }}</span>
                <span class="shrink-0 text-xs tabular-nums text-amber-300">{{ recap.progress }} %</span>
              </span>
              <span class="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/10">
                <span class="block h-full rounded-full bg-amber-400 transition-[width] duration-700" :style="{ width: `${recap.progress}%` }" />
              </span>
              <span class="mt-1 block text-xs text-muted-foreground">{{ t('Season {number}', { number: recap.seasonNumber }) }} · {{ t(recap.label) }}</span>
            </NuxtLink>
          </DropdownMenuItem>
        </template>

        <DropdownMenuSeparator class="my-3" />
        <DropdownMenuItem as-child class="cursor-pointer rounded-lg px-2 py-2 text-sm">
          <NuxtLink to="/profile">{{ t('My tickets and points') }}</NuxtLink>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </ClientOnly>
</template>

<script setup lang="ts">
import { TicketIcon } from 'lucide-vue-next';
import { computed } from 'vue';
import { Button } from '~/components/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/shadcn/dropdown-menu';
import { useRecapKeys } from '~/composables/useRecapKeys';
import RecapTicketsBalance from '~/components/RecapTicketsBalance.vue';

const RING_RADIUS = 6;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// Always in the header: the viewer's tickets, and the recap they are unlocking.
const { t } = useI18n();
const user = useSupabaseUser();
const { wallet, running } = useRecapKeys();

/** The furthest along, when several recaps are being prepared. */
const current = computed(() => running.value.reduce<(typeof running.value)[number] | null>(
  (best, recap) => (!best || recap.progress > best.progress ? recap : best),
  null,
));

const triggerLabel = computed(() => {
  const tickets = wallet.value?.unlimited
    ? t('Unlimited tickets')
    : wallet.value?.keys === 1 ? t('1 ticket available') : t('{count} tickets available', { count: wallet.value?.keys ?? 0 });
  if (!current.value) return tickets;
  return `${tickets} · ${t('Recap being prepared: {progress} %', { progress: current.value.progress })}`;
});
</script>
