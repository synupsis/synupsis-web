import type { RecapSlideSuggestion } from '~/types/recap-slide-suggestion.types';

/** The most liked first; among equals, the earliest. */
export function compareSuggestions(a: RecapSlideSuggestion, b: RecapSlideSuggestion) {
  return b.likeCount - a.likeCount || a.createdAt.localeCompare(b.createdAt);
}
