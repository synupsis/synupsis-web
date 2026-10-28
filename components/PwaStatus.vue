<template>
  <div
    v-if="!online || $pwa?.needRefresh"
    class="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-md space-y-3 sm:left-auto sm:right-6 sm:mx-0 sm:w-96"
    aria-live="polite"
    aria-atomic="true"
  >
    <div v-if="!online" role="status" class="flex items-start gap-3 rounded-2xl border border-white/10 bg-zinc-950/95 p-4 text-white shadow-xl backdrop-blur">
      <WifiOff class="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden="true" />
      <div>
        <p class="text-sm font-medium">{{ t('You are offline') }}</p>
        <p class="mt-1 text-xs leading-relaxed text-zinc-400">{{ t('Reconnect to load shows, recaps and your library.') }}</p>
      </div>
    </div>

    <div v-if="$pwa?.needRefresh" class="rounded-2xl border border-white/10 bg-zinc-950/95 p-4 text-white shadow-xl backdrop-blur">
      <div class="flex items-start gap-3">
        <RefreshCw class="mt-0.5 size-4 shrink-0 text-violet-300" aria-hidden="true" />
        <div>
          <p class="text-sm font-medium">{{ t('A new version of Synupsis is available') }}</p>
          <p class="mt-1 text-xs leading-relaxed text-zinc-400">{{ t('Save your changes before updating. The app will reload.') }}</p>
        </div>
      </div>
      <p v-if="updateFailed" role="alert" class="mt-3 text-xs text-rose-300">{{ t('The update failed. Please try again.') }}</p>
      <div class="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" :disabled="updating" @click="$pwa?.cancelPrompt()">
          {{ t('Later') }}
        </Button>
        <Button type="button" size="sm" :disabled="updating || !online" @click="update">
          {{ updating ? t('Updating…') : t('Update') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useOnline } from '@vueuse/core';
import { RefreshCw, WifiOff } from 'lucide-vue-next';
import { Button } from '~/components/shadcn/button';

const { t } = useI18n();
const { $pwa } = useNuxtApp();
const online = useOnline();
const updating = ref(false);
const updateFailed = ref(false);

async function update() {
  if (!$pwa || updating.value || !online.value) return;
  updating.value = true;
  updateFailed.value = false;
  try {
    await $pwa.updateServiceWorker(true);
  } catch {
    updateFailed.value = true;
  } finally {
    updating.value = false;
  }
}
</script>
