import { shallowRef } from 'vue';
import type { Json } from '~/types/database.types';
import type { RecapStorySlideContent } from '~/types/recap-story.types';

export type RecapStoryPayload = {
  id: string;
  status: string;
  /** Who unlocked the recap, when they have a username. */
  unlockedBy: string | null;
  show: { name: string; trakt_id: number; genres: string[] };
  season: { number: number; image: string | null };
  slides: Array<{
    id: string;
    order: number;
    canvas_data: Json | null;
    image_url?: string | null;
    image_focus?: { x: number; y: number } | null;
    content: RecapStorySlideContent | null;
    events: Array<{
      id: string;
      title: string;
      confidence: number;
    }>;
    evidence: Array<{
      id: string;
      episodeNumber: number | null;
      locale: string;
      provider: string;
      sourceUrl: string | null;
      revisionId: string | null;
      licenseName: string;
      licenseUrl: string | null;
    }>;
  }>;
  sourceProviders: Array<{
    id: string;
    label: string;
    sourceUrl: string | null;
    termsUrl: string | null;
    licenseName: string;
    licenseUrl: string | null;
    commercialUse: string;
    attributionRequired: boolean;
  }>;
  sourceRights: {
    registryVersion?: string;
    mode?: string;
    ready?: boolean;
    approvedProviderIds?: string[];
    warnings?: string[];
  } | null;
  qualityReport: Json | null;
};

/** The query parameter that opens a story above the current page. */
export const STORY_QUERY_KEY = 'story';

// A recap is edited or regenerated rarely: a few minutes of cache keep reopening instant.
const STORY_CACHE_MS = 5 * 60_000;
// The first image may take this long to arrive before the story opens without it.
const FIRST_IMAGE_WAIT_MS = 800;

const storyRequests = new Map<string, { at: number; request: Promise<RecapStoryPayload> }>();

function preloadImage(url: string | null | undefined): Promise<void> {
  if (!url) return Promise.resolve();
  const image = new Image();
  image.src = url;
  return image.decode().catch(() => undefined);
}

/**
 * Loads a recap once per few minutes and warms its first images, so the story
 * opens on a ready slide. Browser only: the cache lives in this module.
 */
export function loadRecapStory(recapId: string): Promise<RecapStoryPayload> {
  const cached = storyRequests.get(recapId);
  if (cached && Date.now() - cached.at < STORY_CACHE_MS) return cached.request;

  const request = $fetch<RecapStoryPayload>(`/api/recap/${recapId}`).then(async (story) => {
    const [first, second] = story.slides;
    void preloadImage(second?.image_url);
    await Promise.race([
      preloadImage(first?.image_url),
      new Promise(resolve => setTimeout(resolve, FIRST_IMAGE_WAIT_MS)),
    ]);
    return story;
  });
  request.catch(() => storyRequests.delete(recapId));
  storyRequests.set(recapId, { at: Date.now(), request });
  return request;
}

export function prefetchRecapStory(recapId: string | null | undefined) {
  if (import.meta.client && recapId) void loadRecapStory(recapId).catch(() => undefined);
}

/** The element a story grows out of, and shrinks back into: its season ring. */
export function findStoryOrigin(recapId: string): HTMLElement | null {
  if (!import.meta.client) return null;
  return document.querySelector<HTMLElement>(`[data-story-origin="${CSS.escape(recapId)}"]`);
}

// Whether the open story added its own history entry, which closing removes.
const pushedStory = shallowRef(false);

/**
 * Stories open above the current page through `?story=<id>`: the page stays
 * mounted underneath, the back button closes the story and a refresh reopens it.
 */
export function useStoryViewer() {
  const route = useRoute();
  const router = useRouter();

  function openStory(recapId: string) {
    prefetchRecapStory(recapId);
    if (route.query[STORY_QUERY_KEY] === recapId) return;
    pushedStory.value = true;
    return router.push({ query: { ...route.query, [STORY_QUERY_KEY]: recapId } });
  }

  function closeStory() {
    if (pushedStory.value) {
      pushedStory.value = false;
      router.back();
      return;
    }
    const { [STORY_QUERY_KEY]: _story, ...query } = route.query;
    return router.replace({ query });
  }

  /** The story closed without `closeStory`: by the back button, or by leaving the page. */
  function forgetStoryEntry() {
    pushedStory.value = false;
  }

  return { openStory, closeStory, forgetStoryEntry };
}
