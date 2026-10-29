<template>
  <div>
    <p class="flex items-center gap-2 font-semibold" :class="compact ? 'text-sm' : 'text-xl'">
      <TicketIcon class="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <span class="tabular-nums">
        {{ wallet.unlimited ? t('Unlimited tickets') : wallet.keys === 1 ? t('1 ticket available') : t('{count} tickets available', { count: wallet.keys }) }}
      </span>
    </p>
    <p v-if="!wallet.unlimited && isFull && progress === wallet.pointsPerKey" class="text-sm text-muted-foreground" :class="compact ? 'mt-3' : 'mt-5'">
      {{ t('1 ticket in reserve') }}
    </p>
    <div v-else-if="!wallet.unlimited && !isFull" :class="compact ? 'mt-3' : 'mt-5'">
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span class="text-muted-foreground">{{ t('Next ticket') }}</span>
        <span class="tabular-nums">{{ t('{points} / {total} points', { points: progress, total: wallet.pointsPerKey }) }}</span>
      </div>
      <div
        class="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        :aria-label="t('Next ticket')"
        :aria-valuenow="progress"
        :aria-valuemin="0"
        :aria-valuemax="wallet.pointsPerKey"
        :aria-valuetext="t('{points} / {total} points', { points: progress, total: wallet.pointsPerKey })"
      >
        <div class="h-full rounded-full bg-primary motion-safe:transition-[width]" :style="{ width: `${progress / wallet.pointsPerKey * 100}%` }" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { TicketIcon } from 'lucide-vue-next';
import { computed } from 'vue';
import type { RecapWallet } from '~/lib/recap-keys';

const props = defineProps<{
  wallet: RecapWallet;
  compact?: boolean;
}>();
const { t } = useI18n();
const progress = computed(() => Math.max(0, Math.min(props.wallet.keyProgress, props.wallet.pointsPerKey)));
const isFull = computed(() => props.wallet.keys >= props.wallet.maxKeys);
</script>
