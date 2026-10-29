<template>
  <span class="hidden" aria-hidden="true" />
</template>

<script setup lang="ts">
import { toast } from 'vue-sonner';
import { useRecapKeys } from '~/composables/useRecapKeys';
import { useRecapNotices } from '~/composables/useRecapNotices';
import { useStoryViewer } from '~/composables/useStoryViewer';

type RecapNotice = {
  jobId: string;
  ready: boolean;
  recapId: string | null;
  keyRefunded: boolean;
  showName: string;
  seasonNumber: number;
};

const POLL_INTERVAL_MS = 5_000;

// Mounted once for the whole app: keeps the viewer's keys and running recaps
// current for the header, and tells them how each recap they unlocked ended,
// whether they watched it end on its show page or came back later.
const { t } = useI18n();
const user = useSupabaseUser();
const { openStory } = useStoryViewer();
const { notifyWhileHidden } = useRecapNotices();
const { running, completedVersion, refreshWallet, refreshRunning, clear } = useRecapKeys();
let timer: ReturnType<typeof setTimeout> | null = null;
let mounted = false;
let checking: Promise<void> | null = null;
let retryNeeded = false;

async function checkNotices() {
  if (!user.value) return false;
  const userId = user.value.sub;
  try {
    const { notices } = await $fetch<{ notices: RecapNotice[] }>('/api/recap/generation/notices', { method: 'POST' });
    if (!mounted || user.value?.sub !== userId) return false;
    // A job may have finished before this visit ever saw it in the active list.
    if (notices.length) completedVersion.value += 1;
    for (const notice of notices) {
      const recap = t('{show}, season {number}', { show: notice.showName, number: notice.seasonNumber });
      if (notice.ready && notice.recapId) {
        if (notifyWhileHidden(t('The recap you unlocked is ready.'), recap)) continue;
        const recapId = notice.recapId;
        toast.success(t('The recap you unlocked is ready.'), {
          description: recap,
          duration: 10_000,
          action: { label: t('View'), onClick: () => openStory(recapId) },
        });
      } else {
        toast.error(t('The recap you unlocked could not be made.'), {
          description: notice.keyRefunded ? `${recap} · ${t('Your ticket was given back.')}` : recap,
          duration: 10_000,
        });
      }
    }
    return true;
  } catch (cause) {
    console.warn('Could not read the recap notices.', cause);
    return false;
  }
}

// Follows the running recaps while there are some: one that leaves the list
// has ended, which may give a key back and has a notice to tell.
function schedulePoll() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!mounted || !user.value || (!running.value.length && !retryNeeded)) return;
  timer = setTimeout(() => { void start(); }, POLL_INTERVAL_MS);
}

function start() {
  if (!mounted || !user.value) return Promise.resolve();
  if (checking) return checking;
  checking = (async () => {
    // Read notices after the active jobs: a job ending between these reads is
    // either notified now or remains in the list and is caught by the next poll.
    const runningRead = await refreshRunning();
    const [walletRead, noticesRead] = await Promise.all([refreshWallet(), checkNotices()]);
    retryNeeded = !runningRead || !walletRead || !noticesRead;
  })().finally(() => {
    checking = null;
    schedulePoll();
  });
  return checking;
}

// Points come in while the viewer is elsewhere: their keys are read again on return.
function handleVisibility() {
  if (document.visibilityState === 'visible' && user.value) void start();
}

onMounted(() => {
  mounted = true;
  void start();
  document.addEventListener('visibilitychange', handleVisibility);
});
onBeforeUnmount(() => {
  mounted = false;
  if (timer) clearTimeout(timer);
  document.removeEventListener('visibilitychange', handleVisibility);
});
watch(() => user.value?.sub, (current, previous) => {
  if (current !== previous) {
    clear();
    if (current) void start();
    else schedulePoll();
  }
});
watch(completedVersion, () => { void start(); });
watch(() => running.value.map(job => job.id).join(), () => {
  if (!checking) schedulePoll();
});
</script>
