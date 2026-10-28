<template>
  <article
    class="relative isolate h-full w-full overflow-hidden bg-slate-950 text-white [container-type:inline-size]"
    :class="[densityClass, { 'recap-editable': editable }]"
    @click="selectText"
    @keydown.enter="selectText"
  >
    <template v-if="imageLayout === 'full'">
      <Transition name="story-image" mode="out-in">
        <img
          v-if="imageUrl"
          :key="imageUrl"
          :src="imageUrl"
          alt=""
          class="absolute inset-0 h-full w-full object-cover"
          :class="{ 'recap-cover-drift': content.kind === 'cover', 'recap-cover-drift-paused': content.kind === 'cover' && !playing }"
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
      ref="columnElement"
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
        class="recap-still-fade recap-band relative -mx-6 -mb-10 flex-1 overflow-hidden sm:-mx-7"
        aria-hidden="true"
      >
        <Transition name="story-image" mode="out-in">
          <img
            :key="imageUrl ?? ''"
            :src="imageUrl ?? undefined"
            alt=""
            class="absolute inset-0 h-full w-full object-cover"
            :style="{ objectPosition: imageFocus ? `${imageFocus.x}% ${imageFocus.y}%` : '50% 30%' }"
          >
        </Transition>
        <div class="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent" />
      </div>

      <template v-if="content.kind === 'cover'">
        <!-- A title card over the season poster: the show's logo, then the season at a glance. -->
        <div class="mt-auto flex flex-col items-center text-center">
          <h2 v-if="content.logoUrl && !isLogoBroken" class="sr-only">{{ content.title }}</h2>
          <img
            v-if="content.logoUrl && !isLogoBroken"
            :src="content.logoUrl"
            alt=""
            class="recap-cover-logo w-auto object-contain drop-shadow-[0_6px_28px_rgb(0_0_0/0.65)]"
            @error="isLogoBroken = true"
          >
          <h2 v-else class="recap-cover-title max-w-[12ch] font-bold leading-[0.98] tracking-[-0.035em]">
            {{ content.title }}
          </h2>
          <p class="mt-5 flex flex-wrap items-center justify-center gap-x-2 text-[15px] font-medium text-white/80">
            <span>{{ t('Season {number}', { number: seasonNumber }) }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ episodeCountLabel }}</span>
            <template v-if="content.year">
              <span aria-hidden="true">·</span>
              <span>{{ content.year }}</span>
            </template>
          </p>
          <p v-if="displaySubtitle" class="recap-cover-subtitle mt-5 max-w-[24ch] font-semibold leading-snug text-white" v-bind="field('subtitle')">
            {{ displaySubtitle }}<RecapSuggestionChip :path="'subtitle'" :count="countOf('subtitle')" />
          </p>
          <p v-if="displayLogline" class="recap-cover-logline mt-3 max-w-[34ch] leading-relaxed text-white/75" v-bind="field('logline')">
            {{ displayLogline }}<RecapSuggestionChip :path="'logline'" :count="countOf('logline')" />
          </p>
        </div>
      </template>

      <template v-else-if="content.kind === 'chapter'">
        <div class="relative mt-auto">
          <p class="recap-chapter-number font-extrabold leading-[0.8] tracking-[-0.06em] text-white/[0.14] tabular-nums" aria-hidden="true">
            {{ String(content.episodeNumber).padStart(2, '0') }}
          </p>
          <p class="mt-5 text-sm font-semibold" :style="{ color: accentColor }">
            {{ t('Episode {number}', { number: content.episodeNumber }) }}<template v-if="content.episodeTitle"> · {{ content.episodeTitle }}</template>
          </p>
          <h2 class="recap-chapter-title mt-3 font-bold tracking-[-0.035em]" v-bind="field('headline')">
            {{ content.headline }}<RecapSuggestionChip :path="'headline'" :count="countOf('headline')" />
          </h2>
        </div>
      </template>

      <template v-else-if="content.kind === 'moment'">
        <div class="relative mt-auto">
          <div class="flex items-center gap-2.5">
            <span class="shrink-0 whitespace-nowrap rounded-full border border-amber-500/50 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
              {{ t('Turning point') }}
            </span>
            <span class="text-[13px] text-white/65">
              {{ t('Episode {number}', { number: content.episodeNumber }) }}<template v-if="content.location"> · <span v-bind="field('location')">{{ content.location }}<RecapSuggestionChip :path="'location'" :count="countOf('location')" /></span></template>
            </span>
          </div>
          <h2 class="recap-moment-title mt-4 font-bold tracking-[-0.03em]" v-bind="field('text')">
            {{ content.text }}<RecapSuggestionChip :path="'text'" :count="countOf('text')" />
          </h2>
          <p v-if="content.detail" class="recap-detail mt-4 flex gap-2.5 text-white/80">
            <span class="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full" :style="{ backgroundColor: accentColor }" aria-hidden="true" />
            <span v-bind="field('detail')">{{ content.detail }}<RecapSuggestionChip :path="'detail'" :count="countOf('detail')" /></span>
          </p>
          <ul v-if="content.characters.length" class="mt-5 flex flex-wrap gap-x-4 gap-y-2.5" :aria-label="t('In this scene')">
            <li v-for="character in content.characters" :key="character.name" class="flex items-center gap-2">
              <RecapCharacterAvatar :character="character" class="h-9 w-9 bg-white/15 text-xs" />
              <span class="text-[15px] font-medium text-white/90">{{ character.name }}</span>
            </li>
          </ul>
        </div>
      </template>

      <template v-else-if="content.kind === 'moment-group'">
        <div class="relative flex min-h-0 flex-col" :class="{ 'flex-1': imageLayout !== 'band' }">
          <p class="text-sm font-semibold" :style="{ color: accentColor }">
            {{ t('Episode {number}', { number: content.episodeNumber }) }} · {{ content.heading }}
          </p>
          <ul class="flex flex-col divide-y divide-white/10" :class="imageLayout === 'band' ? 'mt-3' : 'mt-auto'">
            <li v-for="(item, index) in content.items" :key="index" class="py-4 first:pt-2 last:pb-0">
              <div v-if="item.location || item.characters.length" class="flex items-center justify-between gap-3">
                <span class="text-sm font-semibold text-white/60" v-bind="item.location ? field(`items.${index}.location`) : {}">{{ item.location }}<RecapSuggestionChip :path="`items.${index}.location`" :count="countOf(`items.${index}.location`)" /></span>
                <span class="flex pl-1.5" :aria-label="item.characters.map(character => character.name).join(', ')">
                  <RecapCharacterAvatar
                    v-for="character in item.characters"
                    :key="character.name"
                    :character="character"
                    class="-ml-1.5 h-8 w-8 border-2 border-slate-950 bg-zinc-800 text-[11px]"
                  />
                </span>
              </div>
              <p class="recap-group-text mt-2 font-medium text-white/95" v-bind="field(`items.${index}.text`)">{{ item.text }}<RecapSuggestionChip :path="`items.${index}.text`" :count="countOf(`items.${index}.text`)" /></p>
            </li>
          </ul>
        </div>
      </template>

      <template v-else-if="content.kind === 'changes'">
        <div class="relative flex min-h-0 flex-col" :class="{ 'flex-1': imageLayout !== 'band' }">
          <p class="text-sm font-semibold" :style="{ color: accentColor }">
            {{ t('Episode {number}', { number: content.episodeNumber }) }} · {{ t('Outcome') }}
          </p>
          <h2 class="recap-heading mt-3 font-bold leading-[1.05] tracking-[-0.03em]">{{ t('What changed') }}</h2>
          <div class="flex flex-col gap-5" :class="imageLayout === 'band' ? 'mt-5' : 'mt-auto'">
            <ul v-if="content.deaths.length || content.situations.length" class="flex flex-col divide-y divide-white/10">
              <li v-for="(death, index) in content.deaths" :key="`death-${index}`" class="recap-row flex items-start gap-3.5">
                <RecapCharacterAvatar :character="death.character" muted class="recap-avatar mt-0.5 border border-dashed border-white/20 bg-zinc-700/60 text-xs text-zinc-300" />
                <span class="min-w-0">
                  <span class="block text-sm font-semibold text-white/55">{{ t('Death') }}</span>
                  <span class="recap-line mt-0.5 block text-white/90"><span v-if="needsName(death)" class="font-semibold text-white">{{ death.character?.name }} · </span><span v-bind="field(`deaths.${index}.text`)">{{ death.text }}<RecapSuggestionChip :path="`deaths.${index}.text`" :count="countOf(`deaths.${index}.text`)" /></span></span>
                </span>
              </li>
              <li v-for="(situation, index) in content.situations" :key="`situation-${index}`" class="recap-row flex items-start gap-3.5">
                <RecapCharacterAvatar :character="situation.character" class="recap-avatar mt-0.5 bg-white/15 text-xs" />
                <span class="recap-line min-w-0 text-white/90"><span v-if="needsName(situation)" class="font-semibold text-white">{{ situation.character?.name }} · </span><span v-bind="field(`situations.${index}.text`)">{{ situation.text }}<RecapSuggestionChip :path="`situations.${index}.text`" :count="countOf(`situations.${index}.text`)" /></span></span>
              </li>
            </ul>
            <div v-for="(question, index) in content.questions" :key="`question-${index}`">
              <p class="text-sm font-semibold" :style="{ color: accentColor }">{{ t('Open question') }}</p>
              <p class="recap-question mt-1.5 font-semibold" v-bind="field(`questions.${index}`)">{{ question }}<RecapSuggestionChip :path="`questions.${index}`" :count="countOf(`questions.${index}`)" /></p>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="content.kind === 'ending-status'">
        <div class="relative flex min-h-0 flex-col" :class="{ 'flex-1': imageLayout !== 'band' }">
          <p class="text-sm font-semibold" :style="{ color: accentColor }">{{ t('End of season {number}', { number: seasonNumber }) }}</p>
          <h2 class="recap-heading mt-3 font-bold leading-[1.05] tracking-[-0.03em]">{{ t('Where things stand') }}</h2>
          <ul class="flex flex-col divide-y divide-white/10" :class="imageLayout === 'band' ? 'mt-5' : 'mt-auto'">
            <li v-for="(line, index) in content.characters" :key="index" class="recap-row recap-row-loose flex items-start gap-3.5">
              <RecapCharacterAvatar :character="line.character" class="recap-avatar recap-avatar-lg mt-0.5 bg-white/15 text-xs" />
              <span class="min-w-0">
                <span v-if="line.character" class="block text-[15px] font-semibold text-white">{{ line.character.name }}</span>
                <span class="recap-line block text-white/85" v-bind="field(`characters.${index}.text`)">{{ line.text }}<RecapSuggestionChip :path="`characters.${index}.text`" :count="countOf(`characters.${index}.text`)" /></span>
              </span>
            </li>
          </ul>
        </div>
      </template>

      <template v-else-if="content.kind === 'ending-deaths'">
        <div class="relative flex min-h-0 flex-col" :class="{ 'flex-1': imageLayout !== 'band' }">
          <p class="text-sm font-semibold" :style="{ color: accentColor }">{{ t('End of season {number}', { number: seasonNumber }) }}</p>
          <h2 class="recap-heading mt-3 font-bold leading-[1.05] tracking-[-0.03em]">{{ t('Deaths this season') }}</h2>
          <ul class="recap-deaths grid grid-cols-2 gap-x-4" :class="imageLayout === 'band' ? 'mt-5' : 'mt-auto'">
            <li v-for="death in content.deaths" :key="death.character.name" class="flex min-w-0 items-center gap-3">
              <RecapCharacterAvatar :character="death.character" muted class="recap-avatar recap-avatar-lg border border-dashed border-white/20 bg-zinc-700/60 text-xs text-zinc-300" />
              <span class="recap-death-name min-w-0 font-medium leading-tight text-white/90">
                {{ death.character.name }}
                <span class="recap-death-episode mt-0.5 block font-normal text-white/60 tabular-nums">{{ t('Episode {number}', { number: death.episodeNumber }) }}</span>
              </span>
            </li>
          </ul>
        </div>
      </template>

      <template v-else-if="content.kind === 'ending-questions'">
        <div class="relative flex min-h-0 flex-col" :class="{ 'flex-1': imageLayout !== 'band' }">
          <p class="text-sm font-semibold" :style="{ color: accentColor }">{{ t('End of season {number}', { number: seasonNumber }) }}</p>
          <h2 class="recap-heading mt-3 font-bold leading-[1.05] tracking-[-0.03em]">{{ t('Open questions') }}</h2>
          <ul class="flex flex-col divide-y divide-white/10" :class="imageLayout === 'band' ? 'mt-5' : 'mt-auto'">
            <li v-for="(question, index) in content.questions" :key="index" class="py-4 first:pt-0 last:pb-0">
              <p class="recap-question font-semibold" v-bind="field(`questions.${index}.text`)">{{ question.text }}<RecapSuggestionChip :path="`questions.${index}.text`" :count="countOf(`questions.${index}.text`)" /></p>
              <p v-if="question.episodeNumbers.length" class="mt-1.5 text-[13px] text-white/60 tabular-nums">
                {{ question.episodeNumbers.length > 1 ? t('Episodes {numbers}', { numbers: question.episodeNumbers.join(' · ') }) : t('Episode {number}', { number: question.episodeNumbers[0] ?? '' }) }}
              </p>
            </li>
          </ul>
        </div>
      </template>

      <template v-else-if="content.kind === 'beat' || content.kind === 'episode'">
        <div class="flex items-center justify-between gap-3">
          <span
            class="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-[13px] font-semibold text-white/85 backdrop-blur-md"
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
            <p class="text-[13px] font-semibold" :style="{ color: accentColor }">
              {{ t('Episode by episode') }}
            </p>
          </div>

          <h2 class="recap-beat-title recap-episode-title max-w-[14ch] font-bold leading-[1.04] tracking-[-0.03em]" v-bind="field('headline')">
            {{ content.headline }}<RecapSuggestionChip :path="'headline'" :count="countOf('headline')" />
          </h2>

          <ul class="mt-5 space-y-3 rounded-[22px] border border-white/[0.12] bg-black/45 p-5 shadow-2xl backdrop-blur-xl">
            <li v-for="(moment, index) in content.moments" :key="index" class="recap-moment flex gap-3 text-white/90">
              <span class="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full" :style="{ backgroundColor: accentColor }" aria-hidden="true" />
              <span v-bind="field(`moments.${index}`)">{{ moment }}<RecapSuggestionChip :path="`moments.${index}`" :count="countOf(`moments.${index}`)" /></span>
            </li>
          </ul>
        </div>

        <div v-else class="mt-auto min-h-0">
          <div class="mb-4 flex items-center gap-3">
            <span class="h-1.5 w-1.5 rounded-full" :style="{ backgroundColor: accentColor }" />
            <p class="text-[13px] font-semibold" :style="{ color: accentColor }">
              {{ displayTag }}
            </p>
          </div>

          <h2 class="recap-beat-title max-w-[11ch] font-bold leading-[1.02] tracking-[-0.03em]" v-bind="field('headline')">
            {{ content.headline }}<RecapSuggestionChip :path="'headline'" :count="countOf('headline')" />
          </h2>

          <div class="mt-5 rounded-[22px] border border-white/[0.12] bg-black/45 p-5 shadow-2xl backdrop-blur-xl">
            <p class="recap-narration text-white/90" v-bind="field('narration')">
              {{ content.narration }}<RecapSuggestionChip :path="'narration'" :count="countOf('narration')" />
            </p>
          </div>
        </div>
      </template>
    </div>
  </article>
</template>

<script setup lang="ts">
const { t } = useI18n();
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import RecapCharacterAvatar from '~/components/RecapCharacterAvatar.vue';
import RecapSuggestionChip from '~/components/RecapSuggestionChip.vue';
import { editableSlideText } from '~/lib/recap-slide-text';
import type { RecapChangeItem, RecapStorySlideContent } from '~/types/recap-story.types';

const props = defineProps<{
  content: RecapStorySlideContent;
  imageUrl: string | null;
  // Where the image's main face or subject stands (percent): the crop keeps it in frame.
  imageFocus?: { x: number; y: number } | null;
  seasonNumber: number;
  slideNumber: number;
  totalSlides: number;
  genres?: string[];
  // The player's episode rail covers the bottom of the slide.
  hasRail?: boolean;
  // The cover's slow zoom runs only while true: not while the story grows out of
  // its ring or shrinks back into it, as a second moving layer flickers under the
  // frame's clip on iOS (in an installed app especially), nor on thumbnails.
  playing?: boolean;
  // Suggestion mode: the texts open to corrections are outlined and can be picked.
  editable?: boolean;
  selectedPath?: string | null;
  // How many suggestions each text already has, by path.
  suggestionCounts?: Record<string, number>;
}>();

const emit = defineEmits<{
  'select-text': [path: string];
  'open-suggestions': [path: string];
}>();

// Every correctable text carries its path, so a long press can find it, and is
// marked when it has suggestions; in suggestion mode it can also be picked.
function field(path: string) {
  // The same rule as the server: a text it would refuse is not offered.
  if (editableSlideText(props.content, path) === null) return {};
  const attributes = {
    'data-edit-path': path,
    'data-suggested': props.suggestionCounts?.[path] ? String(props.suggestionCounts[path]) : undefined,
  };
  if (!props.editable) return attributes;
  return {
    ...attributes,
    'data-selected': props.selectedPath === path ? '' : undefined,
    role: 'button',
    tabindex: 0,
    'aria-label': t('Suggest a correction for this text'),
  };
}

const countOf = (path: string) => (editableSlideText(props.content, path) === null ? 0 : props.suggestionCounts?.[path] ?? 0);

function selectText(event: MouseEvent | KeyboardEvent) {
  // A suggestion chip lists what was already suggested for its text.
  const chip = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-chip-path]');
  if (chip?.dataset.chipPath) {
    event.stopPropagation();
    emit('open-suggestions', chip.dataset.chipPath);
    return;
  }
  if (!props.editable) return;
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-edit-path]');
  if (!target?.dataset.editPath) return;
  event.stopPropagation();
  emit('select-text', target.dataset.editPath);
}

const accentColor = computed(() => {
  const genres = (props.genres || []).map(genre => genre.toLocaleLowerCase());
  if (genres.includes('comedy')) return '#fbbf24';
  if (genres.includes('fantasy')) return '#c4b5fd';
  if (genres.includes('science-fiction') || genres.includes('sci-fi')) return '#5eead4';
  if (genres.includes('thriller') || genres.includes('crime')) return '#fb7185';
  return '#93c5fd';
});

const CHAPTER_KINDS = new Set(['chapter', 'moment', 'moment-group', 'changes', 'ending-status', 'ending-deaths', 'ending-questions']);

// Chapters slides scale their reading text to how much of it the slide holds.
const textScale = computed<'lg' | 'md' | 'sm'>(() => {
  const content = props.content;
  const scale = (length: number, large: number, medium: number) => (length <= large ? 'lg' : length <= medium ? 'md' : 'sm');
  switch (content.kind) {
    case 'chapter':
      return scale(content.headline.length, 40, 70);
    case 'moment':
      return scale(content.text.length + (content.detail?.length ?? 0) * 0.4, 150, 220);
    case 'moment-group':
      return scale(content.items.map(item => item.text).join(' ').length, 260, 360);
    case 'changes':
      return scale([...content.deaths, ...content.situations].map(item => item.text).join(' ').length + content.questions.join(' ').length * 1.3, 380, 540);
    case 'ending-status':
      return scale(content.characters.map(item => item.text).join(' ').length, 360, 480);
    case 'ending-questions':
      return scale(content.questions.map(question => question.text).join(' ').length, 280, 420);
    default:
      return 'md';
  }
});

const densityClass = computed(() => {
  if (CHAPTER_KINDS.has(props.content.kind)) return `text-scale-${textScale.value}`;
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

/** Characters of reading text, weighted like a narration, that set the density of older slides. */
function measureSlideText(content: RecapStorySlideContent): number {
  if (content.kind === 'episode') return content.moments.join(' ').length * 0.75;
  return content.kind === 'beat' ? content.narration.length : 0;
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
 * Chapters slides use landscape stills: each one gives its still the height
 * its text leaves, so a short slide shows more of the image.
 * Older slides and the cover keep the full-screen image.
 */
const imageLayout = computed<'full' | 'band'>(() => (
  props.imageUrl && CHAPTER_KINDS.has(props.content.kind) ? 'band' : 'full'
));

const episodeCountLabel = computed(() => {
  if (props.content.kind !== 'cover') return '';
  const count = props.content.episodeCount;
  return count === 1 ? t('{count} episode', { count }) : t('{count} episodes', { count });
});

const isLogoBroken = ref(false);

// A subtitle that only says "Saison 1" repeats the line above it.
const displaySubtitle = computed(() => {
  if (props.content.kind !== 'cover') return '';
  const subtitle = props.content.subtitle.trim();
  return /^saison\s+\d+\.?$/i.test(subtitle) ? '' : subtitle;
});

const displayLogline = computed(() => {
  if (props.content.kind !== 'cover') return '';
  return looksArtificiallyTruncated(props.content.logline) ? '' : props.content.logline;
});

const displayTag = computed(() => {
  if (props.content.kind !== 'beat' || looksArtificiallyTruncated(props.content.tag)) return t("Key moment");
  return props.content.tag || t("Key moment");
});

const episodeLabel = computed(() => {
  if (props.content.kind === 'episode') {
    const { episodeNumber, part, partCount } = props.content;
    return partCount && partCount > 1 ? t("Episode {number} · {part}/{count}", { number: episodeNumber, part: part ?? 1, count: partCount }) : t("Episode {number}", { number: episodeNumber });
  }
  if (props.content.kind !== 'beat') return '';
  const numbers = props.content.episodeNumbers;
  return numbers.length === 1 ? t("Episode {number}", { number: numbers[0] ?? '' }) : t("Episodes {numbers}", { numbers: numbers.join(' · ') });
});

const paddedSlideNumber = computed(() => String(props.slideNumber).padStart(2, '0'));
const paddedTotalSlides = computed(() => String(props.totalSlides).padStart(2, '0'));

function looksArtificiallyTruncated(value: string): boolean {
  return /(?:\.{3}|…)\s*$/.test(value.trim());
}

// The text scale above follows the text's length; the screen's height decides
// the rest. A slide whose text runs under the episode rail, or pushes the still
// under the header, shrinks its type and its still step by step until it fits.
const FIT_STEP = 0.05;
const MIN_FIT = 0.7;

const columnElement = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

// Layout boxes, not screen boxes: the player may be scaling the slide in.
function bottomWithin(column: HTMLElement, element: HTMLElement): number {
  let top = 0;
  let node: HTMLElement | null = element;
  while (node && node !== column) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return top + element.offsetHeight;
}

function overflows(column: HTMLElement): boolean {
  const content = column.lastElementChild as HTMLElement | null;
  if (!content) return false;
  // A block that flexes down to the space left lets its children overflow it, so
  // they count too (scrollHeight would also count tall glyphs over tight lines).
  const limit = column.clientHeight - Number.parseFloat(getComputedStyle(column).paddingBottom);
  const bottom = Math.max(bottomWithin(column, content), ...[...content.children].map(child => bottomWithin(column, child as HTMLElement)));
  return bottom > limit + 1;
}

function fitContent() {
  const column = columnElement.value;
  if (!column) return;
  let fit = 1;
  column.style.setProperty('--fit', '1');
  while (fit > MIN_FIT && overflows(column)) {
    fit = Math.max(MIN_FIT, Math.round((fit - FIT_STEP) * 100) / 100);
    column.style.setProperty('--fit', String(fit));
  }
}

onMounted(() => {
  fitContent();
  // The phone's browser bars come and go, and the fonts arrive late.
  if (typeof ResizeObserver !== 'undefined' && columnElement.value) {
    let lastHeight = columnElement.value.clientHeight;
    resizeObserver = new ResizeObserver(([entry]) => {
      const height = entry?.contentRect.height ?? 0;
      if (Math.abs(height - lastHeight) < 1) return;
      lastHeight = height;
      fitContent();
    });
    resizeObserver.observe(columnElement.value);
  }
  void document.fonts?.ready.then(fitContent);
});

onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<style scoped>
/* Suggestion mode: each correctable text is outlined; one with suggestions in amber. */
.recap-editable [data-edit-path] {
  cursor: pointer;
  border-radius: 4px;
  outline: 1.5px dashed rgb(255 255 255 / 0.55);
  outline-offset: 3px;
  transition: background-color 150ms, outline-color 150ms;
}
.recap-editable [data-edit-path][data-suggested] { outline-color: rgb(251 191 36 / 0.9); }
.recap-editable [data-edit-path]:hover,
.recap-editable [data-edit-path]:focus-visible { background-color: rgb(255 255 255 / 0.12); outline-style: solid; }
.recap-editable [data-edit-path][data-selected] {
  background-color: rgb(255 255 255 / 0.18);
  outline: 2px solid rgb(255 255 255);
}
/* --fit (1 down to 0.7) is set by fitContent when the slide runs out of height. */
.recap-heading { font-size: calc(34px * var(--fit, 1)); }

/* Lists of characters tighten with their text. */
.recap-row { padding-block: calc(0.75rem * var(--fit, 1)); }
.recap-row-loose { padding-block: calc(0.875rem * var(--fit, 1)); }
.recap-row:first-child { padding-top: 0; }
.recap-row-loose:last-child { padding-bottom: 0; }
.recap-avatar { width: calc(2.5rem * var(--fit, 1)); height: calc(2.5rem * var(--fit, 1)); }
.recap-avatar-lg { width: calc(2.75rem * var(--fit, 1)); height: calc(2.75rem * var(--fit, 1)); }
.recap-deaths { row-gap: calc(1rem * var(--fit, 1)); }
.recap-death-name { font-size: calc(15px * var(--fit, 1)); }
.recap-death-episode { font-size: calc(13px * var(--fit, 1)); }
.recap-chapter-number { font-size: calc(104px * var(--fit, 1)); }
/* The still shrinks with the text, never so far that the text reaches the header. */
.recap-band { min-height: max(calc(32cqw * var(--fit, 1)), calc(7.25rem + env(safe-area-inset-top))); }

.recap-beat-title { font-size: calc(34px * var(--fit, 1)); }
.recap-episode-title { font-size: calc(30px * var(--fit, 1)); }

@media (min-width: 640px) {
  .recap-beat-title { font-size: calc(38px * var(--fit, 1)); }
  .recap-episode-title { font-size: calc(34px * var(--fit, 1)); }
}

.recap-narration {
  font-size: calc(18px * var(--fit, 1));
  line-height: 1.55;
}

.density-medium .recap-narration {
  font-size: calc(16px * var(--fit, 1));
  line-height: 1.52;
}

.density-high .recap-narration {
  font-size: calc(14px * var(--fit, 1));
  line-height: 1.48;
}

.recap-moment {
  font-size: calc(16px * var(--fit, 1));
  line-height: 1.45;
}

.recap-chapter-title { font-size: calc(40px * var(--fit, 1)); line-height: 1.04; }
.text-scale-md .recap-chapter-title { font-size: calc(36px * var(--fit, 1)); }
.text-scale-sm .recap-chapter-title { font-size: calc(31px * var(--fit, 1)); line-height: 1.08; }

.recap-moment-title { font-size: calc(36px * var(--fit, 1)); line-height: 1.1; }
.text-scale-md .recap-moment-title { font-size: calc(31px * var(--fit, 1)); line-height: 1.12; }
.text-scale-sm .recap-moment-title { font-size: calc(27px * var(--fit, 1)); line-height: 1.15; }

.recap-detail { font-size: calc(17px * var(--fit, 1)); line-height: 1.45; }
.text-scale-sm .recap-detail { font-size: calc(15px * var(--fit, 1)); }

.recap-group-text { font-size: calc(21px * var(--fit, 1)); line-height: 1.36; }
.text-scale-md .recap-group-text { font-size: calc(19px * var(--fit, 1)); line-height: 1.38; }
.text-scale-sm .recap-group-text { font-size: calc(17px * var(--fit, 1)); line-height: 1.4; }

.recap-line { font-size: calc(18px * var(--fit, 1)); line-height: 1.4; }
.text-scale-md .recap-line { font-size: calc(16.5px * var(--fit, 1)); }
.text-scale-sm .recap-line { font-size: calc(15px * var(--fit, 1)); line-height: 1.38; }

.recap-question { font-size: calc(22px * var(--fit, 1)); line-height: 1.28; }
.text-scale-md .recap-question { font-size: calc(20px * var(--fit, 1)); }
.text-scale-sm .recap-question { font-size: calc(18px * var(--fit, 1)); line-height: 1.32; }

.recap-still-fade {
  -webkit-mask-image: linear-gradient(to bottom, #000 45%, rgb(0 0 0 / 0.55) 72%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 45%, rgb(0 0 0 / 0.55) 72%, transparent 100%);
}

.density-medium .recap-moment {
  font-size: calc(15px * var(--fit, 1));
}

.density-high .recap-moment {
  font-size: calc(13.5px * var(--fit, 1));
  line-height: 1.42;
}

.density-high .recap-beat-title {
  font-size: calc(30px * var(--fit, 1));
}

.recap-cover-logo {
  max-height: 7rem;
  max-width: 82%;
}

.recap-cover-title {
  font-size: calc(44px * var(--fit, 1));
}

.recap-cover-subtitle {
  font-size: calc(21px * var(--fit, 1));
}

.recap-cover-logline {
  font-size: calc(15px * var(--fit, 1));
}

.density-cover-high .recap-cover-logo {
  max-height: 5.5rem;
}

.density-cover-high .recap-cover-title {
  font-size: calc(34px * var(--fit, 1));
}

.density-cover-high .recap-cover-subtitle {
  font-size: calc(17px * var(--fit, 1));
}

.density-cover-high .recap-cover-logline {
  font-size: calc(13px * var(--fit, 1));
  line-height: 1.55;
}

/* The poster slowly comes closer while the cover is on screen. */
.recap-cover-drift {
  animation: recap-cover-drift 14s ease-out forwards;
  transform-origin: 50% 35%;
  backface-visibility: hidden;
}

/* Held where it is, so the zoom neither jumps nor moves while the frame animates. */
.recap-cover-drift-paused {
  animation-play-state: paused;
}

@keyframes recap-cover-drift {
  from { transform: scale(1.02); }
  to { transform: scale(1.1); }
}

@media (prefers-reduced-motion: reduce) {
  .recap-cover-drift {
    animation: none;
  }
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
