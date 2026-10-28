<template>
  <div class="min-h-screen bg-background text-foreground">
    <AppHeader
      compact
      contained
      class="sticky top-0 z-40 border-b border-white/10 bg-background/85 backdrop-blur-xl"
    />

    <main class="mx-auto max-w-7xl px-5 py-8 sm:py-12 lg:px-8">
      <div v-if="pending" class="grid min-h-[60vh] place-items-center"><SpinLoader class="h-8 w-8" /></div>
      <div v-else-if="!story" class="grid min-h-[60vh] place-items-center text-center">
        <div>
          <h1 class="text-2xl font-bold">{{ t('Unable to load the recap.') }}</h1>
          <Button class="mt-5" @click="refresh()">{{ t('Retry') }}</Button>
        </div>
      </div>

      <template v-else>
        <NuxtLink
          :to="`/shows/${story.show.trakt_id}`"
          class="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-white"
        >
          <ArrowLeftIcon class="h-4 w-4" aria-hidden="true" />
          {{ story.show.name }}
        </NuxtLink>
        <div class="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div class="min-w-0">
            <h1 class="text-3xl font-black tracking-tight sm:text-4xl">{{ t('Recap editor') }}</h1>
            <p class="mt-2 text-sm text-muted-foreground">
              {{ t('Season {number}', { number: story.season.number }) }} · {{ story.slides.length > 1 ? t('{count} slides', { count: story.slides.length }) : t('{count} slide', { count: story.slides.length }) }}
            </p>
          </div>
          <!-- The story opens over the editor: closing it comes back here. -->
          <Button class="shrink-0 rounded-full" @click="openStory(story.id)">
            <PlayIcon class="mr-2 h-4 w-4" aria-hidden="true" />
            {{ t('Watch the recap') }}
          </Button>
        </div>

        <div class="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div class="min-w-0 space-y-10">
            <section
              v-for="chapter in chapters"
              :key="chapter.key"
              :aria-labelledby="`chapter-${chapter.key}`"
            >
              <h2 :id="`chapter-${chapter.key}`" class="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
                {{ chapter.title }}
                <span v-if="chapter.subtitle" class="font-normal text-muted-foreground">· {{ chapter.subtitle }}</span>
                <span class="text-xs font-normal text-muted-foreground tabular-nums">{{ chapter.indexes.length > 1 ? t('{count} slides', { count: chapter.indexes.length }) : t('{count} slide', { count: chapter.indexes.length }) }}</span>
              </h2>
              <!-- A scroller clips both axes: its padding, taken back by negative margins, leaves room for the focus ring. -->
              <ol class="-mx-5 mt-4 flex gap-4 overflow-x-auto px-5 pb-3 pt-1 [scrollbar-color:rgb(255_255_255/0.2)_transparent] [scrollbar-width:thin] sm:mx-0 sm:px-1">
                <li v-for="index in chapter.indexes" :key="story.slides[index]!.id" class="shrink-0">
                  <button
                    type="button"
                    class="group block rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    :aria-label="t('Slide {number}: {kind}. Suggest a correction', { number: index + 1, kind: slideKindLabel(story.slides[index]!.content?.kind) })"
                    @click="openSlide(index)"
                  >
                    <span class="relative block overflow-hidden rounded-xl ring-1 ring-white/10 transition group-hover:ring-white/30">
                      <RecapSlideThumbnail
                        :slide="story.slides[index]!"
                        :season-number="story.season.number"
                        :slide-number="index + 1"
                        :total-slides="story.slides.length"
                        :genres="story.show.genres"
                        :width="THUMBNAIL_WIDTH"
                        :suggestion-counts="store.countsByPath(index + 1)"
                      />
                      <span class="absolute inset-0 grid place-items-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        <span class="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900">
                          <SquarePenIcon class="h-3.5 w-3.5" aria-hidden="true" />
                          {{ t('Suggest a correction') }}
                        </span>
                      </span>
                      <span
                        v-if="store.countBySlide.value.get(index + 1)"
                        class="absolute right-2 top-2 grid h-6 min-w-6 place-items-center rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-neutral-900 tabular-nums"
                        :title="t('Suggestions on this slide')"
                      >{{ store.countBySlide.value.get(index + 1) }}</span>
                    </span>
                    <span class="mt-2 block text-xs font-semibold tabular-nums text-white/80" :style="{ width: `${THUMBNAIL_WIDTH}px` }">
                      {{ index + 1 }} · {{ slideKindLabel(story.slides[index]!.content?.kind) }}
                    </span>
                  </button>
                </li>
                <li class="shrink-0">
                  <button
                    type="button"
                    class="grid place-items-center rounded-xl border border-dashed border-white/20 text-center text-muted-foreground outline-none transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                    :style="{ width: `${THUMBNAIL_WIDTH}px`, height: `${thumbnailHeight}px` }"
                    @click="openSlide(chapter.indexes[chapter.indexes.length - 1]!, 'add')"
                  >
                    <span class="flex flex-col items-center gap-2 px-4">
                      <PlusIcon class="h-6 w-6" aria-hidden="true" />
                      <span class="text-sm font-semibold">{{ t('Suggest a slide') }}</span>
                      <span class="text-xs">{{ t('After slide {number}', { number: chapter.indexes[chapter.indexes.length - 1]! + 1 }) }}</span>
                    </span>
                  </button>
                </li>
              </ol>
            </section>
          </div>

          <aside class="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-lg font-semibold">{{ t('Suggestions') }}</h2>
              <div class="flex gap-1.5" role="group" :aria-label="t('Suggestions to show')">
                <button
                  v-for="tab in suggestionTabs"
                  :key="tab.id"
                  type="button"
                  class="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
                  :class="suggestionTab === tab.id ? 'border-primary/50 bg-primary/15 text-primary' : 'border-white/10 text-muted-foreground hover:border-white/20 hover:text-white'"
                  :aria-pressed="suggestionTab === tab.id"
                  @click="suggestionTab = tab.id"
                >
                  {{ tab.label }}
                </button>
              </div>
            </div>
            <div v-if="store.loading.value && !store.loaded.value" class="grid min-h-28 place-items-center"><SpinLoader class="h-5 w-5" /></div>
            <p v-else-if="!listedSuggestions.length" class="mt-4 text-[15px] text-white/50">
              {{ suggestionTab === 'mine' ? t('You have not suggested anything on this recap yet.') : t('No suggestions yet. Open a slide to suggest the first one.') }}
            </p>
            <ul v-else class="mt-2 divide-y divide-white/[0.08]">
              <li v-for="suggestion in listedSuggestions" :key="suggestion.id">
                <RecapSuggestionItem
                  :suggestion="suggestion"
                  show-slide
                  @like="store.toggleLike(suggestion)"
                  @open-slide="openSlide(suggestion.slideOrder - 1)"
                />
              </li>
            </ul>
          </aside>
        </div>
      </template>
    </main>

    <Dialog v-model:open="slideOpen">
      <DialogContent class="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{{ t('Slide {number}', { number: slideIndex + 1 }) }} · {{ slideKindLabel(openedSlide?.content?.kind) }}</DialogTitle>
          <DialogDescription>
            {{ openedSlide?.content ? t('Click a text on the slide to correct it. The team reviews the suggestions.') : t('Describe the change you suggest. The team reviews the suggestions.') }}
          </DialogDescription>
        </DialogHeader>
        <div v-if="openedSlide && story" class="flex flex-col gap-6 sm:flex-row">
          <div class="mx-auto shrink-0 self-start overflow-hidden rounded-xl ring-1 ring-white/10">
            <RecapSlideThumbnail
              :slide="openedSlide"
              :season-number="story.season.number"
              :slide-number="slideIndex + 1"
              :total-slides="story.slides.length"
              :genres="story.show.genres"
              :width="260"
              :editable="Boolean(openedSlide.content)"
              :selected-path="selectedPath"
              :suggestion-counts="store.countsByPath(slideIndex + 1)"
              @select-text="selectedPath = $event"
              @open-suggestions="openTextSuggestions"
            />
          </div>
          <RecapSuggestionPanel
            :key="`${openedSlide.id}-${panelMode ?? 'list'}`"
            v-model:selected-path="selectedPath"
            v-model:list-path="listPath"
            class="min-w-0 flex-1"
            :store="store"
            :slide="openedSlide"
            :slide-order="slideIndex + 1"
            :initial-mode="panelMode"
          />
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeftIcon, PlayIcon, PlusIcon, SquarePenIcon } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { Button } from '~/components/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/shadcn/dialog';
import RecapSlideThumbnail from '~/components/RecapSlideThumbnail.vue';
import RecapSuggestionItem from '~/components/RecapSuggestionItem.vue';
import RecapSuggestionPanel from '~/components/RecapSuggestionPanel.vue';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import { useRecapSuggestions } from '~/composables/useRecapSuggestions';
import { useStoryViewer, type RecapStoryPayload } from '~/composables/useStoryViewer';
import type { RecapStorySlideContent } from '~/types/recap-story.types';

const THUMBNAIL_WIDTH = 160;
const thumbnailHeight = Math.round(THUMBNAIL_WIDTH * 844 / 390);

const { t } = useI18n();
const route = useRoute();
const user = useSupabaseUser();
const recapId = String(route.params.id);

const { data: story, pending, refresh } = await useFetch<RecapStoryPayload>(`/api/recap/${recapId}`);
// Read with the viewer's session, which only the browser has for sure.
const store = useRecapSuggestions(recapId);
const { openStory } = useStoryViewer();
onMounted(() => store.load());

type Chapter = { key: string; title: string; subtitle: string | null; indexes: number[] };

// The same chapters as the player's rail: the cover, one per episode, then the end.
function chapterOf(content: RecapStorySlideContent | null) {
  if (!content || content.kind === 'cover') return { key: 'cover', title: t('Cover') };
  if (content.kind === 'ending-status' || content.kind === 'ending-deaths' || content.kind === 'ending-questions') {
    return { key: 'end', title: t('Season ending') };
  }
  if (content.kind === 'beat') return { key: 'beats', title: t('The essentials') };
  return { key: `episode-${content.episodeNumber}`, title: t('Episode {number}', { number: content.episodeNumber }) };
}

const chapters = computed<Chapter[]>(() => {
  const list: Chapter[] = [];
  (story.value?.slides ?? []).forEach((slide, index) => {
    const chapter = chapterOf(slide.content);
    const last = list[list.length - 1];
    if (last?.key === chapter.key) {
      last.indexes.push(index);
      return;
    }
    const opening = slide.content?.kind === 'chapter' ? slide.content.episodeTitle : null;
    list.push({ key: chapter.key, title: chapter.title, subtitle: opening || null, indexes: [index] });
  });
  return list;
});

function slideKindLabel(kind: string | null | undefined) {
  const labels: Record<string, string> = {
    cover: t('Cover'),
    beat: t('Turning point'),
    episode: t('Episode'),
    chapter: t('Episode opening'),
    moment: t('Key moment'),
    'moment-group': t('Other moments'),
    changes: t('What changed'),
    'ending-status': t('Where things stand'),
    'ending-deaths': t('Deaths'),
    'ending-questions': t('Open questions'),
  };
  return (kind && labels[kind]) || t('Slide');
}

type SuggestionTab = 'top' | 'mine';
const suggestionTab = ref<SuggestionTab>('top');
const suggestionTabs = computed(() => [
  { id: 'top' as const, label: t('Top') },
  ...(user.value ? [{ id: 'mine' as const, label: t('Mine') }] : []),
]);
const listedSuggestions = computed(() => (suggestionTab.value === 'mine'
  ? store.suggestions.value.filter(suggestion => suggestion.isMine)
  : store.suggestions.value));

// One slide, larger: its texts can be picked, beside its suggestions.
const slideOpen = ref(false);
const slideIndex = ref(0);
const panelMode = ref<'add' | null>(null);
const selectedPath = ref<string | null>(null);
// The text whose chip was clicked: only its suggestions are listed.
const listPath = ref<string | null>(null);
const openedSlide = computed(() => story.value?.slides[slideIndex.value] ?? null);

function openSlide(index: number, mode: 'add' | null = null) {
  if (!story.value?.slides[index]) return;
  slideIndex.value = index;
  panelMode.value = mode;
  selectedPath.value = null;
  listPath.value = null;
  slideOpen.value = true;
}

function openTextSuggestions(path: string) {
  selectedPath.value = null;
  listPath.value = path;
}

useHead(() => ({
  title: story.value
    ? `${t('Recap editor')} · ${story.value.show.name} — Synupsis`
    : `${t('Recap editor')} — Synupsis`,
}));
</script>
