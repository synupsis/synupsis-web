<template>
  <article
    class="relative isolate h-full w-full overflow-hidden bg-slate-950 text-white [container-type:inline-size]"
    :class="densityClass"
  >
    <!-- Text-heavy chapter slides keep only the blurred colors of their still. -->
    <template v-if="imageLayout === 'ambient'">
      <Transition name="story-image" mode="out-in">
        <img
          :key="`ambient-${imageUrl}`"
          :src="imageUrl ?? undefined"
          alt=""
          aria-hidden="true"
          class="absolute inset-0 h-full w-full scale-125 object-cover opacity-45 blur-2xl"
        >
      </Transition>
      <div class="absolute inset-0 bg-black/55" />
      <div class="absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-black via-black/80 to-transparent" />
    </template>
    <template v-else-if="imageLayout === 'full'">
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
    </template>
    <div
      class="absolute -right-20 top-[18%] h-52 w-52 rounded-full opacity-25 blur-3xl"
      :style="{ backgroundColor: accentColor }"
    />

    <div
      class="relative flex h-full min-h-0 flex-col px-6 sm:px-7"
      :class="[
        hasRail ? 'pb-28' : 'pb-[max(2rem,env(safe-area-inset-bottom))]',
        imageLayout === 'band' ? 'pt-0' : 'pt-28',
      ]"
    >
      <!-- A landscape still fills the height the text leaves, and the text rises into its fade. -->
      <!-- The still turns transparent towards the text instead of fading to a fixed color, so it
           blends into whatever lies behind (the slide ground and its accent halo) without a seam. -->
      <div
        v-if="imageLayout === 'band'"
        class="recap-still-fade relative -mx-6 -mb-10 min-h-[32cqw] flex-1 overflow-hidden sm:-mx-7"
        aria-hidden="true"
      >
        <Transition name="story-image" mode="out-in">
          <img
            :key="imageUrl ?? ''"
            :src="imageUrl ?? undefined"
            alt=""
            class="absolute inset-0 h-full w-full object-cover object-[center_30%]"
          >
        </Transition>
        <div class="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent" />
      </div>

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

      <template v-else-if="content.kind === 'chapter'">
        <div class="relative mt-auto">
          <p class="text-[112px] font-extrabold leading-[0.8] tracking-[-0.06em] text-white/[0.12] tabular-nums" aria-hidden="true">
            {{ String(content.episodeNumber).padStart(2, '0') }}
          </p>
          <div class="mt-5 flex items-center gap-2.5">
            <span class="h-px w-8" :style="{ backgroundColor: accentColor }" />
            <p class="text-[11px] font-semibold uppercase tracking-[0.19em]" :style="{ color: accentColor }">
              Épisode {{ content.episodeNumber }}<template v-if="content.episodeTitle"> · {{ content.episodeTitle }}</template>
            </p>
          </div>
          <h2 class="recap-chapter-title mt-3.5 text-[34px] font-bold leading-[1.04] tracking-[-0.035em]">
            {{ content.headline }}
          </h2>
          <ul v-if="content.locations.length" class="mt-5 flex flex-wrap gap-2">
            <li
              v-for="location in content.locations"
              :key="location"
              class="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold text-white/85"
            >
              {{ location }}
            </li>
          </ul>
          <p class="mt-6 flex min-h-11 items-center border-t border-white/10 pt-4 text-xs text-white/60 tabular-nums">
            {{ chapterSummary }}
          </p>
        </div>
      </template>

      <template v-else-if="content.kind === 'moment'">
        <div class="relative mt-auto">
          <div class="flex items-center gap-2">
            <span class="rounded-full border border-amber-500/50 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
              Décisif
            </span>
            <span class="text-xs text-white/60">
              Épisode {{ content.episodeNumber }}<template v-if="content.location"> · {{ content.location }}</template>
            </span>
          </div>
          <h2 class="recap-moment-title mt-4 font-bold tracking-[-0.03em]">
            {{ content.text }}
          </h2>
          <div v-if="content.detail" class="mt-5 flex gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3.5">
            <span class="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full" :style="{ backgroundColor: accentColor }" aria-hidden="true" />
            <p class="text-sm leading-relaxed text-white/85">{{ content.detail }}</p>
          </div>
          <template v-if="content.characters.length">
            <p class="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">Dans la scène</p>
            <ul class="mt-2.5 flex flex-wrap gap-2">
              <li
                v-for="character in content.characters"
                :key="character.name"
                class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] py-1 pl-1 pr-3"
              >
                <RecapCharacterAvatar :character="character" class="h-7 w-7 bg-white/15 text-[11px]" />
                <span class="text-[13px] font-medium text-white/90">{{ character.name }}</span>
              </li>
            </ul>
          </template>
        </div>
      </template>

      <template v-else-if="content.kind === 'moment-group'">
        <div class="relative flex min-h-0 flex-col" :class="{ 'flex-1': imageLayout !== 'band' }">
          <div class="flex items-center gap-2.5">
            <span class="h-px w-8" :style="{ backgroundColor: accentColor }" />
            <p class="text-[11px] font-semibold uppercase tracking-[0.19em]" :style="{ color: accentColor }">
              Épisode {{ content.episodeNumber }}
            </p>
          </div>
          <h2 class="mt-3.5 text-[32px] font-bold leading-[1.05] tracking-[-0.03em]">{{ content.heading }}</h2>
          <ul class="flex flex-col gap-3" :class="imageLayout === 'band' ? 'mt-5' : 'mt-auto'">
            <li
              v-for="(item, index) in content.items"
              :key="index"
              class="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.035] p-4"
            >
              <div v-if="item.location || item.characters.length" class="flex items-center justify-between gap-2">
                <span class="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">{{ item.location }}</span>
                <span class="flex" :aria-label="item.characters.map(character => character.name).join(', ')">
                  <RecapCharacterAvatar
                    v-for="character in item.characters"
                    :key="character.name"
                    :character="character"
                    class="-ml-1.5 h-[26px] w-[26px] border-2 border-slate-950 bg-zinc-800 text-[10px]"
                  />
                </span>
              </div>
              <p class="recap-moment text-white/90">{{ item.text }}</p>
            </li>
          </ul>
        </div>
      </template>

      <template v-else-if="content.kind === 'changes'">
        <div class="flex min-h-0 flex-1 flex-col">
          <div class="flex items-center gap-2.5">
            <span class="h-px w-8" :style="{ backgroundColor: accentColor }" />
            <p class="text-[11px] font-semibold uppercase tracking-[0.19em]" :style="{ color: accentColor }">
              Épisode {{ content.episodeNumber }} · Bilan
            </p>
          </div>
          <h2 class="mt-3 text-[32px] font-bold leading-[1.05] tracking-[-0.03em]">Ce qui a changé</h2>
          <div class="recap-changes mt-auto flex flex-col gap-4">
            <ul v-if="content.deaths.length" class="flex flex-col gap-2">
              <li
                v-for="(death, index) in content.deaths"
                :key="index"
                class="flex items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-3"
              >
                <RecapCharacterAvatar :character="death.character" muted class="h-9 w-9 bg-zinc-700/60 text-[11px] text-zinc-300" />
                <span class="min-w-0">
                  <span class="block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">Mort</span>
                  <span class="recap-change-text block text-white/85"><span v-if="needsName(death)" class="font-semibold text-white">{{ death.character?.name }} · </span>{{ death.text }}</span>
                </span>
              </li>
            </ul>
            <div v-if="content.situations.length">
              <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">Nouvelles situations</p>
              <ul class="mt-1.5">
                <li
                  v-for="(situation, index) in content.situations"
                  :key="index"
                  class="flex items-center gap-3 border-b border-white/10 py-2.5"
                >
                  <RecapCharacterAvatar :character="situation.character" class="h-[30px] w-[30px] bg-white/15 text-[11px]" />
                  <span class="recap-change-text min-w-0 text-white/85"><span v-if="needsName(situation)" class="font-semibold text-white">{{ situation.character?.name }} · </span>{{ situation.text }}</span>
                </li>
              </ul>
            </div>
            <div
              v-for="(question, index) in content.questions"
              :key="`question-${index}`"
              class="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5"
            >
              <p class="text-[10px] font-semibold uppercase tracking-[0.16em]" :style="{ color: accentColor }">Question ouverte</p>
              <p class="mt-1.5 text-base font-semibold leading-snug">{{ question }}</p>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="content.kind === 'ending-status'">
        <div class="flex min-h-0 flex-1 flex-col">
          <div class="flex items-center gap-2.5">
            <span class="h-px w-8" :style="{ backgroundColor: accentColor }" />
            <p class="text-[11px] font-semibold uppercase tracking-[0.19em]" :style="{ color: accentColor }">Fin de la saison {{ seasonNumber }}</p>
          </div>
          <h2 class="mt-3 text-[32px] font-bold leading-[1.05] tracking-[-0.03em]">Où en est-on</h2>
          <ul class="mt-auto">
            <li
              v-for="(line, index) in content.characters"
              :key="index"
              class="flex items-center gap-3 border-b border-white/10 py-2.5"
            >
              <RecapCharacterAvatar :character="line.character" class="h-[30px] w-[30px] bg-white/15 text-[11px]" />
              <span class="recap-change-text min-w-0 text-white/85"><span v-if="needsName(line)" class="font-semibold text-white">{{ line.character?.name }} · </span>{{ line.text }}</span>
            </li>
          </ul>
        </div>
      </template>

      <template v-else-if="content.kind === 'ending-deaths'">
        <div class="flex min-h-0 flex-1 flex-col">
          <div class="flex items-center gap-2.5">
            <span class="h-px w-8" :style="{ backgroundColor: accentColor }" />
            <p class="text-[11px] font-semibold uppercase tracking-[0.19em]" :style="{ color: accentColor }">Fin de la saison {{ seasonNumber }}</p>
          </div>
          <h2 class="mt-3 text-[32px] font-bold leading-[1.05] tracking-[-0.03em]">Morts cette saison</h2>
          <ul class="mt-auto grid grid-cols-2 gap-x-3 gap-y-3">
            <li v-for="death in content.deaths" :key="death.character.name" class="flex min-w-0 items-center gap-2.5">
              <RecapCharacterAvatar :character="death.character" muted class="h-9 w-9 border border-dashed border-white/15 bg-zinc-700/60 text-[11px] text-zinc-300" />
              <span class="min-w-0 text-[13px] leading-tight text-white/85">
                {{ death.character.name }}
                <span class="block text-xs text-white/60 tabular-nums">Épisode {{ death.episodeNumber }}</span>
              </span>
            </li>
          </ul>
        </div>
      </template>

      <template v-else-if="content.kind === 'ending-questions'">
        <div class="flex min-h-0 flex-1 flex-col">
          <div class="flex items-center gap-2.5">
            <span class="h-px w-8" :style="{ backgroundColor: accentColor }" />
            <p class="text-[11px] font-semibold uppercase tracking-[0.19em]" :style="{ color: accentColor }">Fin de la saison {{ seasonNumber }}</p>
          </div>
          <h2 class="mt-3 text-[32px] font-bold leading-[1.05] tracking-[-0.03em]">Questions ouvertes</h2>
          <ul class="mt-auto flex flex-col gap-2.5">
            <li
              v-for="(question, index) in content.questions"
              :key="index"
              class="flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5"
            >
              <span class="text-base font-semibold leading-snug">{{ question.text }}</span>
              <span v-if="question.episodeNumbers.length" class="text-xs text-white/60 tabular-nums">
                {{ question.episodeNumbers.length > 1 ? 'Épisodes' : 'Épisode' }} {{ question.episodeNumbers.join(' · ') }}
              </span>
            </li>
          </ul>
        </div>
      </template>

      <template v-else-if="content.kind === 'beat' || content.kind === 'episode'">
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

        <div v-if="content.kind === 'episode'" class="mt-auto min-h-0">
          <div class="mb-4 flex items-center gap-3">
            <span class="h-1.5 w-1.5 rounded-full" :style="{ backgroundColor: accentColor }" />
            <p class="text-[11px] font-semibold uppercase tracking-[0.19em]" :style="{ color: accentColor }">
              Épisode par épisode
            </p>
          </div>

          <h2 class="recap-beat-title max-w-[14ch] text-[30px] font-bold leading-[1.04] tracking-[-0.03em] sm:text-[34px]">
            {{ content.headline }}
          </h2>

          <ul class="mt-5 space-y-3 rounded-[22px] border border-white/[0.12] bg-black/45 p-5 shadow-2xl backdrop-blur-xl">
            <li v-for="(moment, index) in content.moments" :key="index" class="recap-moment flex gap-3 text-white/90">
              <span class="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full" :style="{ backgroundColor: accentColor }" aria-hidden="true" />
              <span>{{ moment }}</span>
            </li>
          </ul>
        </div>

        <div v-else class="mt-auto min-h-0">
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
import RecapCharacterAvatar from '~/components/RecapCharacterAvatar.vue';
import type { RecapChangeItem, RecapStorySlideContent } from '~/types/recap-story.types';

const props = defineProps<{
  content: RecapStorySlideContent;
  imageUrl: string | null;
  seasonNumber: number;
  slideNumber: number;
  totalSlides: number;
  genres?: string[];
  // The player's episode rail covers the bottom of the slide.
  hasRail?: boolean;
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
  const length = measureSlideText(props.content);
  if (length > 420) return 'density-high';
  if (length > 300) return 'density-medium';
  return 'density-comfortable';
});

/** Characters of reading text, weighted like a narration, that set the density. */
function measureSlideText(content: RecapStorySlideContent): number {
  switch (content.kind) {
    case 'episode':
      return content.moments.join(' ').length * 0.75;
    case 'beat':
      return content.narration.length;
    case 'moment':
      return content.text.length * 1.4 + (content.detail?.length ?? 0) * 0.5;
    case 'moment-group':
      return content.items.map(item => item.text).join(' ').length * 0.75;
    case 'changes':
      return [...content.deaths, ...content.situations].map(item => item.text).join(' ').length * 0.8
        + content.questions.join(' ').length;
    case 'ending-status':
      return content.characters.map(item => item.text).join(' ').length * 0.8;
    default:
      return 0;
  }
}

// A line that only says "elle" or "il" gets its character's name in front. A
// nickname counts as the name when it shares its first letters ("Richie" for Richard).
function needsName(item: RecapChangeItem): boolean {
  if (!item.character) return false;
  const textWords = normalizeName(item.text).split(' ');
  return !normalizeName(item.character.name).split(' ')
    .filter(word => word.length >= 3)
    .some(word => textWords.some(textWord => textWord === word || (word.length >= 4 && textWord.startsWith(word.slice(0, 4)))));
}

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Chapters slides use landscape stills: moments and cards give the still the
 * height their text leaves, text-heavy slides only its blurred colors.
 * Older slides and the cover keep the full-screen image.
 */
const imageLayout = computed<'full' | 'band' | 'ambient'>(() => {
  if (!props.imageUrl) return 'full';
  switch (props.content.kind) {
    case 'chapter':
    case 'moment':
    case 'moment-group':
      return 'band';
    case 'changes':
    case 'ending-status':
    case 'ending-deaths':
    case 'ending-questions':
      return 'ambient';
    default:
      return 'full';
  }
});

const chapterSummary = computed(() => {
  if (props.content.kind !== 'chapter') return '';
  const { decisiveCount, otherCount } = props.content;
  const parts = [
    decisiveCount ? `${decisiveCount} moment${decisiveCount > 1 ? 's' : ''} décisif${decisiveCount > 1 ? 's' : ''}` : '',
    otherCount ? `${otherCount} autre${otherCount > 1 ? 's' : ''}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
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
  if (props.content.kind === 'episode') {
    const { episodeNumber, part, partCount } = props.content;
    return partCount && partCount > 1 ? `Épisode ${episodeNumber} · ${part}/${partCount}` : `Épisode ${episodeNumber}`;
  }
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

.recap-moment {
  font-size: 16px;
  line-height: 1.45;
}

.recap-still-fade {
  -webkit-mask-image: linear-gradient(to bottom, #000 45%, rgb(0 0 0 / 0.55) 72%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 45%, rgb(0 0 0 / 0.55) 72%, transparent 100%);
}

.recap-moment-title {
  font-size: 28px;
  line-height: 1.12;
}

.density-medium .recap-moment-title {
  font-size: 25px;
}

.density-high .recap-moment-title {
  font-size: 22px;
}

.recap-change-text {
  font-size: 14px;
  line-height: 1.4;
}

.density-high .recap-change-text {
  font-size: 13px;
  line-height: 1.35;
}

.density-high .recap-changes {
  gap: 0.6rem;
}

.density-medium .recap-moment {
  font-size: 15px;
}

.density-high .recap-moment {
  font-size: 13.5px;
  line-height: 1.42;
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
