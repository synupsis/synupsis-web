<template>
  <template v-if="canInstall">
    <Button
      type="button"
      variant="ghost"
      size="sm"
      class="h-9 w-9 px-0 text-muted-foreground sm:w-auto sm:px-3"
      :aria-label="t('Install Synupsis')"
      :title="t('Install Synupsis')"
      :disabled="installing"
      @click="install"
    >
      <Download aria-hidden="true" />
      <span class="hidden sm:inline">{{ t('Install') }}</span>
    </Button>

    <Dialog v-model:open="showInstructions">
      <DialogContent class="max-w-[calc(100%_-_2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t('Install Synupsis') }}</DialogTitle>
          <DialogDescription>
            {{ t('Keep Synupsis on your Home Screen for quick access.') }}
          </DialogDescription>
        </DialogHeader>
        <ol class="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>{{ t('Open the Share menu in Safari.') }}</li>
          <li>{{ t('Choose “Add to Home Screen”, then tap “Add”.') }}</li>
        </ol>
        <DialogFooter>
          <Button type="button" @click="showInstructions = false">{{ t('Got it') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </template>
</template>

<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core';
import { Download } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import { Button } from '~/components/shadcn/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/shadcn/dialog';

const { t } = useI18n();
const emit = defineEmits<{ availability: [available: boolean] }>();
const { $pwa } = useNuxtApp();
const standalone = useMediaQuery('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)');
const iosStandalone = ref(false);
const iosSafari = ref(false);
const showInstructions = ref(false);
const installing = ref(false);

onMounted(() => {
  const agent = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  iosStandalone.value = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  iosSafari.value = window.isSecureContext && 'serviceWorker' in navigator && ios
    && /Version\/.+Safari\//.test(agent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(agent);
});

const canInstall = computed(() => Boolean($pwa)
  && !$pwa?.isPWAInstalled && !standalone.value && !iosStandalone.value
  && Boolean($pwa?.showInstallPrompt || iosSafari.value));

watch(canInstall, available => emit('availability', available), { immediate: true });

async function install() {
  if (!$pwa?.showInstallPrompt) {
    showInstructions.value = true;
    return;
  }

  installing.value = true;
  try {
    await $pwa.install();
  } catch {
    toast.error(t('Installation is unavailable right now. Please try again.'));
  } finally {
    installing.value = false;
  }
}
</script>
