// The rules the database applies to recap keys (migration 20261029100000):
// keep both in step.

/** Keys a viewer starts with. */
export const RECAP_STARTING_KEYS = 3;
/** A wallet stops earning keys at this many. */
export const RECAP_MAX_KEYS = 5;
/** Points, one per viewer who watches the recap, for a new key. */
export const RECAP_POINTS_PER_KEY = 10;
/** The share of a recap's slides a viewer sees before their view counts. */
export const RECAP_VIEW_SHARE = 0.5;
/** Minimum display time per distinct slide, also enforced by the database. */
export const RECAP_VIEW_MIN_SLIDE_MS = 1_000;

export type RecapWallet = {
  keys: number;
  maxKeys: number;
  points: number;
  keyProgress: number;
  pointsPerKey: number;
  /** Admins unlock recaps without spending keys. */
  unlimited: boolean;
};

export function toRecapWallet(
  row: { keys: number; points: number; key_progress: number } | null,
  unlimited = false,
): RecapWallet {
  return {
    unlimited,
    keys: row?.keys ?? RECAP_STARTING_KEYS,
    maxKeys: RECAP_MAX_KEYS,
    points: row?.points ?? 0,
    keyProgress: row?.key_progress ?? 0,
    pointsPerKey: RECAP_POINTS_PER_KEY,
  };
}
