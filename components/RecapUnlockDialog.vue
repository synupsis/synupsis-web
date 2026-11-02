<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-md rounded-3xl border-white/10 bg-background/95 p-6 backdrop-blur-xl">
      <DialogHeader class="text-left">
        <span class="mb-3 grid h-11 w-11 place-items-center rounded-full bg-primary/15 text-primary" aria-hidden="true">
          <TicketIcon class="h-5 w-5" />
        </span>
        <DialogTitle class="text-xl font-extrabold tracking-tight">{{ t('Unlock this recap') }}</DialogTitle>
        <DialogDescription class="text-sm leading-6 text-white/70">
          {{ t('Nobody has unlocked season {number} of {show} yet. Use a ticket to make the recap available to everyone.', { number: seasonNumber, show: showName }) }}
          <template v-if="followers">
            {{ followers === 1 ? t('1 other person follows this series.') : t('{count} other people follow this series.', { count: followers }) }}
          </template>
        </DialogDescription>
      </DialogHeader>

      <p v-if="eligibility && !eligibility.eligible" class="text-sm leading-6 text-amber-300" role="status">
        {{ t(eligibility.message) }}
      </p>

      <ul class="mt-2 grid gap-3 text-sm leading-5 text-white/80">
        <li class="flex gap-3">
          <UserRoundIcon class="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{{ hasUsername ? t('Your name appears on the recap.') : t('Your account has no username: the recap will show no name, but you still earn the points.') }}</span>
        </li>
        <li class="flex gap-3">
          <EyeIcon class="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{{ t('Each person who watches the recap earns you a point. {count} points give you a new ticket.', { count: wallet?.pointsPerKey ?? 10 }) }}</span>
        </li>
        <li class="flex gap-3">
          <ClockIcon class="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{{ t('It takes about five minutes. You can leave the page: we will tell you when it is ready.') }}</span>
        </li>
      </ul>

      <div class="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <div v-if="!wallet" class="grid h-6 place-items-center"><SpinLoader class="h-4 w-4" /></div>
        <template v-else>
          <RecapTicketsBalance :wallet="wallet" compact />
          <p v-if="!wallet.unlimited && wallet.keys < 1" class="mt-3 text-sm leading-6 text-amber-300">
            {{ t('You have no ticket left. The recaps you unlocked earn you new ones as people watch them.') }}
          </p>
        </template>
      </div>

      <DialogFooter class="mt-2 gap-2 sm:gap-2">
        <Button type="button" variant="ghost" class="rounded-full" @click="emit('update:open', false)">{{ t('Not now') }}</Button>
        <Button type="button" class="rounded-full" :disabled="!eligibility?.eligible || !wallet || (!wallet.unlimited && wallet.keys < 1)" @click="emit('confirm')">
          <TicketIcon class="mr-2 h-4 w-4" aria-hidden="true" />
          {{ wallet?.unlimited ? t('Unlock the recap') : t('Unlock the recap · 1 ticket') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ClockIcon, EyeIcon, TicketIcon, UserRoundIcon } from 'lucide-vue-next';
import { Button } from '~/components/shadcn/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/shadcn/dialog';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import RecapTicketsBalance from '~/components/RecapTicketsBalance.vue';
import type { RecapWallet } from '~/lib/recap-keys';
import type { RecapEligibility } from '~/lib/recap-eligibility';

const { t } = useI18n();

defineProps<{
  open: boolean;
  showName: string;
  seasonNumber: number;
  /** Null while it loads. */
  wallet: RecapWallet | null;
  followers: number | null;
  hasUsername: boolean;
  eligibility?: RecapEligibility;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  confirm: [];
}>();
</script>
