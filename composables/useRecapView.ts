import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RECAP_VIEW_MIN_SLIDE_MS } from '~/lib/recap-keys';

type ViewedStory = { id: string; status: string };
type ViewSession = { sessionId: string | null; complete: boolean };

/** Records reading progress only while the published story is actually visible. */
export function useRecapView(options: {
  story: () => ViewedStory | null;
  slideIndex: () => number;
  displayed: () => boolean;
}) {
  const user = useSupabaseUser();
  const visible = ref(false);
  const context = computed(() => {
    const story = options.story();
    const userId = user.value?.sub;
    return userId && story?.status === 'published' ? { userId, recapId: story.id } : null;
  });
  const identity = computed(() => context.value ? `${context.value.userId}:${context.value.recapId}` : '');
  let mounted = false;
  let epoch = 0;
  let sessionId: string | null = null;
  let complete = false;
  let lastIndex: number | null | undefined;
  let needsDwell = false;
  let pending = false;
  let requested = false;
  let dwellRequested = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const isActive = () => mounted && visible.value && options.displayed() && Boolean(context.value);
  const desiredIndex = () => isActive() ? options.slideIndex() : null;

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    clearTimer();
    if (!isActive() || complete) return;
    if (sessionId && lastIndex === desiredIndex() && !needsDwell) return;
    // Server time decides eligibility. The margin avoids a heartbeat arriving
    // just before one full second has elapsed on the server.
    timer = setTimeout(() => requestSync(true), RECAP_VIEW_MIN_SLIDE_MS + 100);
  }

  function requestSync(afterDwell = false) {
    requested = true;
    dwellRequested ||= afterDwell;
    clearTimer();
    void sync();
  }

  async function sync() {
    if (pending) return;
    pending = true;
    try {
      while (requested) {
        requested = false;
        const afterDwell = dwellRequested;
        dwellRequested = false;
        const current = context.value;
        if (!current || complete) continue;
        const operation = epoch;
        const index = desiredIndex();
        try {
          if (!sessionId) {
            if (index === null) continue;
            const result = await $fetch<ViewSession>(`/api/recap/${current.recapId}/view-session`, {
              method: 'POST', body: { slideIndex: index }, timeout: 8_000,
            });
            if (operation !== epoch) continue;
            sessionId = result.sessionId;
            complete = result.complete || !result.sessionId;
            needsDwell = true;
          } else {
            if (index === null && lastIndex === null) continue;
            const result = await $fetch<{ complete: boolean }>(`/api/recap/${current.recapId}/view`, {
              method: 'POST', body: { sessionId, slideIndex: index }, keepalive: index === null, timeout: 8_000,
            });
            if (operation !== epoch) continue;
            complete = result.complete;
            // Only the delayed heartbeat can acknowledge dwell. An immediate
            // same-slide sync (a quick away-and-back transition) may arrive
            // before the server's minimum duration and must keep its timer.
            needsDwell = index !== null && (index !== lastIndex || (needsDwell && !afterDwell));
          }
          lastIndex = index;
          // A slide, visibility or closing transition may have happened while
          // the transport was pending; send its current state next, in order.
          if (!complete && desiredIndex() !== index) requested = true;
        } catch (cause: any) {
          if (operation !== epoch) continue;
          const status = cause?.statusCode ?? cause?.status;
          if (index === null || status === 409 || status === 410) {
            // Do not resume a clock whose pause was lost. Expired sessions
            // likewise need a fresh server clock on the next visible attempt.
            sessionId = null;
            lastIndex = undefined;
          } else if ([400, 401, 403, 404, 422].includes(status)) {
            complete = true;
          }
          // Network errors and transient server failures retry on the next
          // heartbeat. No local counter can award a view or a point.
        }
      }
    } finally {
      pending = false;
      schedule();
    }
  }

  watch(identity, () => {
    epoch += 1;
    sessionId = null;
    complete = false;
    lastIndex = undefined;
    needsDwell = false;
    dwellRequested = false;
    if (mounted) requestSync();
  }, { flush: 'sync' });
  watch([() => options.displayed(), () => options.slideIndex(), visible], () => {
    if (mounted) requestSync();
  }, { flush: 'sync' });

  function handleVisibility() {
    visible.value = document.visibilityState === 'visible';
  }

  onMounted(() => {
    handleVisibility();
    mounted = true;
    document.addEventListener('visibilitychange', handleVisibility);
    requestSync();
  });
  onBeforeUnmount(() => {
    mounted = false;
    clearTimer();
    document.removeEventListener('visibilitychange', handleVisibility);
    // A final pause may follow an already pending request, but teardown can
    // never create another reading session or schedule another heartbeat.
    requestSync();
  });
}
