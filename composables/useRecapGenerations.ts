import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  RECAP_GENERATION_TERMINAL_STATUSES,
  estimateRecapGenerationProgress,
  getRecapGenerationProgress,
  getRecapGenerationStageKey,
} from '~/lib/recap-generation-progress';
import { useStoryViewer } from '~/composables/useStoryViewer';
import type { RecapEligibility } from '~/lib/recap-eligibility';

type PublicRecapGenerationJob = {
  id: string;
  seasonId: string;
  locale: string;
  status: string;
  phase: string | null;
  progress: number;
  recapId: string | null;
  errorMessage: string | null;
  keyState: string;
  /** Whether this authenticated viewer actually received a refund. */
  keyRefunded: boolean;
  stageStartedAt: string;
  serverNow: string;
};

/** How a failure touched the viewer's keys. */
export type RecapGenerationFailure = {
  /** The viewer had no key to unlock the recap with. */
  noKeys: boolean;
  /** The key spent on this recap came back. */
  keyRefunded: boolean;
  /** A refusal before a job or ticket reservation, rather than a failed job. */
  eligibility?: RecapEligibility;
};

export type RecapGeneration = {
  jobId: string | null;
  label: string;
  /** Eased every frame, never moves backwards. */
  progress: number;
  pending: boolean;
  error: string | null;
};

type StageClock = {
  status: string;
  phase: string | null;
  stageKey: string;
  storedProgress: number;
  /** Start of the stage on this browser's clock. */
  stageStartedAt: number;
};

const POLL_INTERVAL_MS = 2_500;
// The server expires a job after 30 minutes: only an unreachable API stops following it.
const MAX_CONSECUTIVE_POLL_FAILURES = 6;
// The displayed value closes about 63 % of its gap to the estimate in this time.
const DISPLAY_SMOOTHING_MS = 350;
// Lets the ring visibly reach 100 % before the season turns into a story.
const COMPLETION_HOLD_MS = 700;

/** A season is generated once per recap language. */
export function recapGenerationKey(seasonId: string, locale: string) {
  return `${seasonId}:${locale}`;
}

/**
 * Follows every recap generation of a show: the ones started on this page and
 * the ones still running server-side when the page loads (after a refresh).
 * Generations are keyed by recapGenerationKey.
 */
export function useRecapGenerations(options: {
  showId: () => string | undefined;
  onCompleted: (key: string, recapId: string | null) => Promise<unknown> | unknown;
  onFailed: (key: string, message: string, failure: RecapGenerationFailure) => void;
}) {
  const user = useSupabaseUser();
  const { openStory } = useStoryViewer();
  const generations = ref<Record<string, RecapGeneration>>({});
  const clocks = new Map<string, StageClock>();
  const followedJobs = new Set<string>();
  let mounted = false;
  let frame = 0;
  let lastFrameAt = 0;

  async function start(seasonId: string, locale: string) {
    const showId = options.showId();
    const key = recapGenerationKey(seasonId, locale);
    if (!showId || generations.value[key]?.pending) return;

    // The request collects the sources before it answers: ease that stage meanwhile.
    clocks.set(key, {
      status: 'gathering',
      phase: null,
      stageKey: 'gathering',
      storedProgress: getRecapGenerationProgress('gathering'),
      stageStartedAt: Date.now(),
    });
    generations.value[key] = {
      jobId: null,
      label: generationStageLabel('gathering'),
      progress: 0,
      pending: true,
      error: null,
    };
    requestFrame();

    try {
      const generation = await $fetch<{ state: string; recapId?: string; jobId?: string }>('/api/recap/generate', {
        method: 'POST',
        body: { showId, seasonId, locale },
      });
      if (generation.state === 'ready' && generation.recapId) {
        forget(key);
        await openStory(generation.recapId);
        return;
      }
      if (!generation.jobId) throw new Error('Generation did not return a job.');
      generations.value[key] = { ...generations.value[key]!, jobId: generation.jobId };
      void follow(key, generation.jobId);
    } catch (cause: any) {
      const noKeys = cause?.data?.data?.code === 'no_recap_keys';
      const eligibility = cause?.data?.data?.eligibility ?? cause?.data?.eligibility;
      if (eligibility?.eligible === false && typeof eligibility.message === 'string') {
        fail(key, eligibility.message, { noKeys: false, keyRefunded: false, eligibility });
        return;
      }
      // A failed HTTP response does not tell us whether the server kept running.
      const keyRefunded = !noKeys && (cause?.data?.keyRefunded === true || cause?.data?.data?.keyRefunded === true);
      fail(key, describeError(cause), { noKeys, keyRefunded });
    }
  }

  async function resume() {
    const showId = options.showId();
    if (!mounted || !showId || !user.value) return;
    try {
      const { jobs } = await $fetch<{ jobs: PublicRecapGenerationJob[] }>('/api/recap/generation/active', {
        query: { showId },
      });
      for (const job of jobs) {
        if (!mounted) return;
        if (followedJobs.has(job.id)) continue;
        const key = recapGenerationKey(job.seasonId, job.locale);
        apply(key, job);
        void follow(key, job.id);
      }
    } catch (cause) {
      console.warn('Could not resume the running recap generations.', cause);
    }
  }

  async function follow(key: string, jobId: string) {
    if (followedJobs.has(jobId)) return;
    followedJobs.add(jobId);
    let failures = 0;
    try {
      while (mounted) {
        try {
          const job = await $fetch<PublicRecapGenerationJob>(`/api/recap/generation/${jobId}`);
          failures = 0;
          if (!mounted) return;
          apply(key, job);
          if (job.status === 'completed') {
            await complete(key, job.recapId);
            return;
          }
          if (RECAP_GENERATION_TERMINAL_STATUSES.includes(job.status)) {
            fail(key, job.errorMessage || 'Generation failed.', {
              noKeys: false,
              keyRefunded: job.keyRefunded === true,
            });
            return;
          }
        } catch (cause: any) {
          failures += 1;
          if (cause?.statusCode === 404 || failures >= MAX_CONSECUTIVE_POLL_FAILURES) {
            fail(key, describeError(cause), { noKeys: false, keyRefunded: false });
            return;
          }
        }
        await sleep(POLL_INTERVAL_MS);
      }
    } finally {
      followedJobs.delete(jobId);
    }
  }

  function apply(key: string, job: PublicRecapGenerationJob) {
    const stageKey = getRecapGenerationStageKey(job.status, job.phase);
    const previous = clocks.get(key);
    const serverStageStart = Date.parse(job.stageStartedAt);
    const serverNow = Date.parse(job.serverNow);
    // Measured on the server clock, so every viewer and every refresh agree.
    const stageStartedAt = Number.isFinite(serverStageStart) && Number.isFinite(serverNow)
      ? Date.now() - Math.max(serverNow - serverStageStart, 0)
      : previous?.stageKey === stageKey ? previous.stageStartedAt : Date.now();
    const clock = { status: job.status, phase: job.phase, stageKey, storedProgress: job.progress, stageStartedAt };
    clocks.set(key, clock);

    const current = generations.value[key];
    generations.value[key] = {
      jobId: job.id,
      label: job.status === 'completed' ? 'Ready' : generationStageLabel(job.status, job.phase),
      // A resumed job shows its estimate at once instead of climbing from zero.
      progress: current?.progress ?? estimate(clock),
      pending: true,
      error: null,
    };
    requestFrame();
  }

  async function complete(key: string, recapId: string | null) {
    await Promise.all([
      Promise.resolve(options.onCompleted(key, recapId)).catch(cause => console.error(cause)),
      sleep(COMPLETION_HOLD_MS),
    ]);
    forget(key);
  }

  function fail(key: string, message: string, failure: RecapGenerationFailure) {
    // Nothing started: the season stays as it was, to unlock later.
    if (failure.noKeys || failure.eligibility) {
      forget(key);
      options.onFailed(key, message, failure);
      return;
    }
    clocks.delete(key);
    const current = generations.value[key];
    generations.value[key] = {
      jobId: current?.jobId ?? null,
      label: 'Failed',
      progress: current?.progress ?? 0,
      pending: false,
      error: message,
    };
    options.onFailed(key, message, failure);
  }

  function forget(key: string) {
    clocks.delete(key);
    const { [key]: _removed, ...rest } = generations.value;
    generations.value = rest;
  }

  function requestFrame() {
    if (!import.meta.client || frame) return;
    lastFrameAt = performance.now();
    frame = requestAnimationFrame(animate);
  }

  function animate(now: number) {
    frame = 0;
    const elapsed = now - lastFrameAt;
    lastFrameAt = now;
    const blend = 1 - Math.exp(-elapsed / DISPLAY_SMOOTHING_MS);

    let moving = false;
    for (const [key, clock] of clocks) {
      const generation = generations.value[key];
      if (!generation) continue;
      moving = true;
      const target = estimate(clock);
      if (target <= generation.progress) continue;
      const next = generation.progress + (target - generation.progress) * blend;
      generation.progress = target - next < 0.05 ? target : next;
    }
    if (moving && mounted) frame = requestAnimationFrame(animate);
  }

  onMounted(() => {
    mounted = true;
    void resume();
  });
  watch(user, (current, previous) => {
    if (current && !previous) void resume();
  });
  onBeforeUnmount(() => {
    mounted = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  });

  return { generations, start };
}

function estimate(clock: StageClock) {
  return estimateRecapGenerationProgress({
    status: clock.status,
    phase: clock.phase,
    progress: clock.storedProgress,
    stageElapsedMs: Date.now() - clock.stageStartedAt,
  });
}

function describeError(cause: any): string {
  return cause?.data?.statusMessage || cause?.statusMessage || cause?.message || 'Generation failed.';
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Keep source messages in state so the UI can translate them reactively.
function generationStageLabel(status: string, phase?: string | null): string {
  const labels = {
    "queued": "Queued",
    "gathering": "Sources",
    "extracting_events": "Scenes",
    "critiquing_events": "Checking",
    "recovering_events": "Checking",
    "linking_events": "Connections",
    "preparing_story": "Writing",
    "writing_story": "Writing",
    "verifying_story": "Reviewing",
    "validating": "Publishing",
    "rendering": "Publishing"
};
  return labels[getRecapGenerationStageKey(status, phase)];
}
