import { estimateRecapGenerationProgress, getRecapGenerationStageKey } from '~/lib/recap-generation-progress';
import type { RecapWallet } from '~/lib/recap-keys';

export type RunningRecap = {
  id: string;
  showName: string;
  showPath: string | null;
  seasonNumber: number;
  locale: string;
  /** The stage, as a source message to translate. */
  label: string;
  progress: number;
};

type MineJob = {
  id: string;
  status: string;
  phase: string | null;
  progress: number;
  locale: string;
  stageStartedAt: string;
  serverNow: string;
  showName: string;
  showPath: string | null;
  seasonNumber: number;
};

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued',
  gathering: 'Sources',
  extracting_events: 'Scenes',
  critiquing_events: 'Checking',
  recovering_events: 'Checking',
  linking_events: 'Connections',
  preparing_story: 'Writing',
  writing_story: 'Writing',
  verifying_story: 'Reviewing',
  validating: 'Publishing',
  rendering: 'Publishing',
};

/**
 * The viewer's keys and the recaps they are unlocking, shared by every page.
 * The header shows them; RecapNotices keeps them current.
 */
export function useRecapKeys() {
  const user = useSupabaseUser();
  const wallet = useState<RecapWallet | null>('recap-keys-wallet', () => null);
  const running = useState<RunningRecap[]>('recap-keys-running', () => []);
  // Any consumer may discover a completed job, including the show page.
  const completedVersion = useState('recap-keys-completed-version', () => 0);

  async function refreshWallet() {
    const userId = user.value?.sub;
    if (!userId) return false;
    try {
      const keys = await $fetch<{ wallet: RecapWallet }>('/api/recap/keys');
      if (user.value?.sub !== userId) return false;
      wallet.value = keys.wallet;
      return true;
    } catch (cause) {
      console.warn('Could not read the recap keys.', cause);
      return false;
    }
  }

  /** Whether the list could be read. */
  async function refreshRunning() {
    const userId = user.value?.sub;
    if (!userId) return false;
    try {
      const { jobs } = await $fetch<{ jobs: MineJob[] }>('/api/recap/generation/mine');
      if (user.value?.sub !== userId) return false;
      const remainingIds = new Set(jobs.map(job => job.id));
      const completed = running.value.some(job => !remainingIds.has(job.id));
      running.value = jobs.map(toRunningRecap);
      if (completed) completedVersion.value += 1;
      return true;
    } catch (cause) {
      console.warn('Could not read the running recaps.', cause);
      return false;
    }
  }

  function clear() {
    wallet.value = null;
    running.value = [];
  }

  return { wallet, running, completedVersion, refreshWallet, refreshRunning, clear };
}

function toRunningRecap(job: MineJob): RunningRecap {
  const stageStartedAt = Date.parse(job.stageStartedAt);
  const serverNow = Date.parse(job.serverNow);
  const stageElapsedMs = Number.isFinite(stageStartedAt) && Number.isFinite(serverNow) ? serverNow - stageStartedAt : 0;
  return {
    id: job.id,
    showName: job.showName,
    showPath: job.showPath,
    seasonNumber: job.seasonNumber,
    locale: job.locale,
    label: STAGE_LABELS[getRecapGenerationStageKey(job.status, job.phase)] ?? 'Preparing',
    progress: Math.floor(estimateRecapGenerationProgress({ status: job.status, phase: job.phase, progress: job.progress, stageElapsedMs })),
  };
}
