<template>
  <article
    class="relative isolate h-full w-full overflow-hidden bg-slate-950 text-white"
    :class="densityClass"
  >
    <Transition name="story-image" mode="out-in">
      <img
        v-if="imageUrl"
        :key="imageUrl"
        :src="imageUrl"
        alt=""
        class="absolute inset-0 h-full w-full object-cover"
      >
      <div v-else :key="'gradient'" class="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-950" />
    </Transition>

    <div class="absolute inset-0 bg-gradient-to-b from-black/55 via-black/5 to-black/95" />
    <div class="absolute inset-x-0 bottom-0 h-[72%] bg-gradient-to-t from-black via-black/75 to-transparent" />
    <div
      class="absolute -right-20 top-[18%] h-52 w-52 rounded-full opacity-25 blur-3xl"
      :style="{ backgroundColor: accentColor }"
    />

    <div class="relative flex h-full min-h-0 flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-28 sm:px-7">
      <template v-if="content.kind === 'cover'">
        <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">
          <span class="h-px w-8" :style="{ backgroundColor: accentColor }" />
          <span>Saison {{ seasonNumber }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ episodeCountLabel }}</span>
        </div>

        <div class="mt-auto">
          <p class="mb-4 text-xs font-semibold uppercase tracking-[0.2em]" :style="{ color: accentColor }">
            Le recap essentiel
          </p>
          <h2 class="recap-cover-title max-w-[10ch] text-[42px] font-bold leading-[0.98] tracking-[-0.035em] sm:text-[46px]">
            {{ content.title }}
          </h2>
          <p v-if="content.subtitle" class="recap-cover-subtitle mt-5 max-w-[28ch] text-xl font-medium leading-tight text-white/90">
            {{ content.subtitle }}
          </p>
          <div v-if="displayLogline" class="mt-6 border-l-2 pl-4" :style="{ borderColor: accentColor }">
            <p class="recap-cover-logline max-w-[34ch] text-[15px] leading-relaxed text-white/[0.78]">
              {{ displayLogline }}
            </p>
          </div>
          <p class="mt-7 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
            La saison, moment par moment
          </p>
        </div>
      </template>

      <template v-else>
        <div class="flex items-center justify-between gap-3">
          <span
            class="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur-md"
          >
            {{ episodeLabel }}
          </span>
          <span class="text-[11px] font-semibold tabular-nums tracking-[0.16em] text-white/55">
            {{ paddedSlideNumber }} / {{ paddedTotalSlides }}
          </span>
        </div>

        <div class="mt-auto min-h-0">
          <div class="mb-4 flex items-center gap-3">
            <span class="h-1.5 w-1.5 rounded-full" :style="{ backgroundColor: accentColor }" />
            <p class="text-[11px] font-semibold uppercase tracking-[0.19em]" :style="{ color: accentColor }">
              {{ displayTag }}
            </p>
          </div>

          <h2 class="recap-beat-title max-w-[11ch] text-[34px] font-bold leading-[1.02] tracking-[-0.03em] sm:text-[38px]">
            {{ content.headline }}
          </h2>

          <div class="mt-5 rounded-[22px] border border-white/[0.12] bg-black/45 p-5 shadow-2xl backdrop-blur-xl">
            <p class="recap-narration text-white/90">
              {{ content.narration }}
            </p>
          </div>
        </div>
      </template>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RecapStorySlideContent } from '~/types/recap-story.types';

const props = defineProps<{
  content: RecapStorySlideContent;
  imageUrl: string | null;
  seasonNumber: number;
  slideNumber: number;
  totalSlides: number;
  genres?: string[];
}>();

const accentColor = computed(() => {
  const genres = (props.genres || []).map(genre => genre.toLocaleLowerCase());
  if (genres.includes('comedy')) return '#fbbf24';
  if (genres.includes('fantasy')) return '#c4b5fd';
  if (genres.includes('science-fiction') || genres.includes('sci-fi')) return '#5eead4';
  if (genres.includes('thriller') || genres.includes('crime')) return '#fb7185';
  return '#93c5fd';
});

const densityClass = computed(() => {
  if (props.content.kind === 'cover') {
    const length = props.content.title.length + props.content.subtitle.length + props.content.logline.length;
    return length > 390 || props.content.title.length > 52
      ? 'density-cover density-cover-high'
      : 'density-cover';
  }
  if (props.content.narration.length > 420) return 'density-high';
  if (props.content.narration.length > 300) return 'density-medium';
  return 'density-comfortable';
});

const episodeCountLabel = computed(() => {
  if (props.content.kind !== 'cover') return '';
  const count = props.content.episodeCount;
  return `${count} épisode${count > 1 ? 's' : ''}`;
});

const displayLogline = computed(() => {
  if (props.content.kind !== 'cover') return '';
  return looksArtificiallyTruncated(props.content.logline) ? '' : props.content.logline;
});

const displayTag = computed(() => {
  if (props.content.kind !== 'beat' || looksArtificiallyTruncated(props.content.tag)) return 'Moment clé';
  return props.content.tag || 'Moment clé';
});

const episodeLabel = computed(() => {
  if (props.content.kind !== 'beat') return '';
  const numbers = props.content.episodeNumbers;
  return numbers.length === 1 ? `Épisode ${numbers[0]}` : `Épisodes ${numbers.join(' · ')}`;
});

const paddedSlideNumber = computed(() => String(props.slideNumber).padStart(2, '0'));
const paddedTotalSlides = computed(() => String(props.totalSlides).padStart(2, '0'));

function looksArtificiallyTruncated(value: string): boolean {
  return /(?:\.{3}|…)\s*$/.test(value.trim());
}
</script>

<style scoped>
.recap-narration {
  font-size: 18px;
  line-height: 1.55;
}

.density-medium .recap-narration {
  font-size: 16px;
  line-height: 1.52;
}

.density-high .recap-narration {
  font-size: 14px;
  line-height: 1.48;
}

.density-high .recap-beat-title {
  font-size: 30px;
}

.density-cover-high .recap-cover-title {
  font-size: 34px;
}

.density-cover-high .recap-cover-subtitle {
  font-size: 17px;
}

.density-cover-high .recap-cover-logline {
  font-size: 13px;
  line-height: 1.55;
}

.story-image-enter-active,
.story-image-leave-active {
  transition: opacity 350ms ease, transform 700ms ease;
}

.story-image-enter-from,
.story-image-leave-to {
  opacity: 0;
  transform: scale(1.035);
}
</style>
