import { planStorySlides } from '~/server/services/recap-generation/slides';
import type { RecapEventGraph, RecapSourceSnapshot } from '~/server/services/recap-generation/types';
import type { RecapStory } from '~/types/recap-story.types';

// Reading and view tracking must agree on the number of displayed slides:
// chapter stories are planned again and can differ from the stored slide rows.
export function getRecapStoryPlan(recap: {
  story_data: unknown;
  source_snapshot: unknown;
  event_graph: unknown;
}) {
  const story = recap.story_data;
  if (!story || typeof story !== 'object' || !('layout' in story) || story.layout !== 'chapters'
    || !recap.source_snapshot || typeof recap.source_snapshot !== 'object'
    || !recap.event_graph || typeof recap.event_graph !== 'object') return null;
  return planStorySlides(story as RecapStory, recap.event_graph as RecapEventGraph, recap.source_snapshot as RecapSourceSnapshot);
}
