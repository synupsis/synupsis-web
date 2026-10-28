export const RECAP_FORMAT_VERSION = 10;
export const RECAP_PROMPT_VERSION = 'recap-story-v10-chapters';
export const RECAP_EVENT_PROMPT_VERSION = 'recap-scenes-v5-critic';
// An episode counts as documented once one source describes its plot instead
// of teasing it. Promotional synopses rarely exceed a couple of sentences.
export const MIN_DOCUMENTED_EPISODE_CHARS = 400;
// Share of documented episodes required before spending tokens on a recap.
export const MIN_DOCUMENTED_EPISODE_RATIO = 0.6;
export const MAX_MOMENTS_PER_EPISODE = 10;
export const MAX_CRITIC_GAPS_PER_EPISODE = 3;
