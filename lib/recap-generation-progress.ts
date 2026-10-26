// Shared by the generation API, which stores the floor of each stage it
// enters, and the browser, which eases the bar towards the stage's ceiling
// from the moment the stage started. A season takes about five minutes.

export const RECAP_GENERATION_ACTIVE_STATUSES = ['queued', 'gathering', 'generating', 'validating', 'rendering'];
export const RECAP_GENERATION_TERMINAL_STATUSES = ['completed', 'failed', 'cancelled', 'needs_review'];

export type RecapGenerationStage = {
  label: string;
  floor: number;
  ceiling: number;
  expectedMs: number;
};

// Ranges follow the time each stage took on real Breaking Bad runs (October 2026).
const RECAP_GENERATION_STAGES = {
  queued: { label: 'En attente', floor: 0, ceiling: 2, expectedMs: 5_000 },
  gathering: { label: 'Sources', floor: 2, ceiling: 9, expectedMs: 22_000 },
  extracting_events: { label: 'Scènes', floor: 9, ceiling: 24, expectedMs: 45_000 },
  critiquing_events: { label: 'Contrôle', floor: 24, ceiling: 39, expectedMs: 45_000 },
  recovering_events: { label: 'Contrôle', floor: 39, ceiling: 43, expectedMs: 15_000 },
  linking_events: { label: 'Liens', floor: 43, ceiling: 62, expectedMs: 60_000 },
  preparing_story: { label: 'Écriture', floor: 62, ceiling: 63, expectedMs: 5_000 },
  writing_story: { label: 'Écriture', floor: 63, ceiling: 80, expectedMs: 55_000 },
  verifying_story: { label: 'Relecture', floor: 80, ceiling: 97, expectedMs: 65_000 },
  validating: { label: 'Publication', floor: 97, ceiling: 98, expectedMs: 3_000 },
  rendering: { label: 'Publication', floor: 98, ceiling: 99, expectedMs: 3_000 },
} satisfies Record<string, RecapGenerationStage>;

export type RecapGenerationStageKey = keyof typeof RECAP_GENERATION_STAGES;

/** The stage of a job: its status, or its phase while it is generating. */
export function getRecapGenerationStageKey(status: string, phase?: string | null): RecapGenerationStageKey {
  const key = status === 'generating' ? phase : status;
  return key && key in RECAP_GENERATION_STAGES ? key as RecapGenerationStageKey : 'queued';
}

export function getRecapGenerationStage(status: string, phase?: string | null): RecapGenerationStage {
  return RECAP_GENERATION_STAGES[getRecapGenerationStageKey(status, phase)];
}

/** The progress stored when a job enters a stage, or a share of it. */
export function getRecapGenerationProgress(stage: RecapGenerationStageKey, share = 0): number {
  const { floor, ceiling } = RECAP_GENERATION_STAGES[stage];
  return Math.round(floor + (ceiling - floor) * Math.min(Math.max(share, 0), 1));
}

/**
 * Eases from the stored progress (the stage's floor, or the share of
 * episodes already extracted) towards the stage's ceiling without ever
 * reaching it: about 86 % of the way after the stage's expected duration.
 */
export function estimateRecapGenerationProgress(input: {
  status: string;
  phase?: string | null;
  progress: number;
  stageElapsedMs: number;
}): number {
  if (input.status === 'completed') return 100;
  if (RECAP_GENERATION_TERMINAL_STATUSES.includes(input.status)) return input.progress;

  const stage = getRecapGenerationStage(input.status, input.phase);
  const base = Math.min(Math.max(input.progress, stage.floor), stage.ceiling);
  const elapsed = Math.max(input.stageElapsedMs, 0);
  const eased = base + (stage.ceiling - base) * (1 - Math.exp((-2 * elapsed) / stage.expectedMs));
  return Math.min(eased, 99);
}
