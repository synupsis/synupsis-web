<template>
  <div
    class="rounded-2xl border bg-black/45 p-5 backdrop-blur-xl transition-colors duration-300"
    :class="revealed ? 'border-amber-500/40' : 'border-white/15'"
  >
    <Transition name="tracker-swap" mode="out-in">
      <div v-if="mode === 'undecided'" key="undecided" class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <h2 class="text-xl font-extrabold tracking-tight">{{ t('Are you watching {name}?', { name: showName }) }}</h2>
          <p class="text-sm leading-6 text-white/70">{{ t('Track your progress: recaps, characters and discussions stop at your current episode, without spoiling what comes next.') }}</p>
        </div>
        <div class="grid gap-2">
          <Button type="button" size="lg" class="w-full rounded-full" @click="emit('start')">
            <PlayIcon class="mr-2 h-4 w-4" aria-hidden="true" />
            {{ t('Start watching') }}
          </Button>
          <Button type="button" variant="outline" size="lg" class="w-full rounded-full" @click="openPicker('set')">
            <FastForwardIcon class="mr-2 h-4 w-4" aria-hidden="true" />
            {{ t('I am already at…') }}
          </Button>
        </div>
      </div>

      <div v-else key="tracking" class="flex flex-col gap-4">
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.025] text-primary transition-colors hover:border-white/25 hover:bg-white/[0.05] disabled:pointer-events-none disabled:opacity-50"
          :aria-label="t('Previous episode')"
          :disabled="!hasPrevious"
          @click="goPrevious"
        >
          <ChevronLeftIcon class="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="group min-w-0 flex-1 rounded-xl px-2 py-1 text-center transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-haspopup="dialog"
          :aria-label="t('Season {season}, episode {episode}: choose another episode', { season: viewSeason, episode: viewEpisode })"
          @click="openPicker('view')"
        >
          <span class="flex items-center justify-center gap-1 text-[28px] font-extrabold leading-9 tracking-tight tabular-nums" aria-live="polite">
            S{{ viewSeason }} · E{{ viewEpisode }}
            <ChevronDownIcon class="h-4 w-4 text-muted-foreground transition-colors group-hover:text-white" aria-hidden="true" />
          </span>
          <span v-if="catalogs[viewSeason] === undefined" class="mx-auto mt-1 block h-4 w-28 animate-pulse rounded bg-white/10" aria-hidden="true" />
          <span v-else class="block truncate text-[13px] text-muted-foreground">{{ viewedEpisode?.title || t('Episode {number}', { number: viewEpisode }) }}</span>
        </button>
        <button
          type="button"
          class="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.025] text-primary transition-colors hover:border-white/25 hover:bg-white/[0.05] disabled:pointer-events-none disabled:opacity-50"
          :aria-label="t('Next episode')"
          :disabled="!hasNext"
          @click="goNext"
        >
          <ChevronRightIcon class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div v-if="viewEpisodes.length" class="flex flex-col gap-2">
        <div class="relative pt-4">
          <!-- The marker glides to the episode on screen. -->
          <span
            class="pointer-events-none absolute top-0 -translate-x-1/2 transition-[left] duration-300 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none"
            :style="{ left: `${((viewEpisode - 0.5) / viewEpisodes.length) * 100}%` }"
            aria-hidden="true"
          >
            <span
              class="block h-2.5 w-2.5 rounded-full shadow-[0_0_0_3px_rgba(0,0,0,0.85),0_0_14px_rgba(255,255,255,0.35)] transition-colors duration-300"
              :class="isSeen ? 'bg-emerald-300' : 'bg-primary'"
            />
          </span>
          <div class="flex gap-1">
            <button
              v-for="episode in viewEpisodes"
              :key="`${viewSeason}-${episode.number}`"
              type="button"
              class="group relative flex h-5 flex-1 items-center focus-visible:outline-none"
              :aria-label="t('Episode {number}', { number: episode.number }) + (episode.title ? ` · ${episode.title}` : '')"
              :aria-current="episode.number === viewEpisode ? 'step' : undefined"
              @click="viewEpisode = episode.number"
            >
              <span
                class="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10 transition-[height,background-color] duration-200 group-hover:h-2 group-hover:bg-white/20 group-focus-visible:ring-1 group-focus-visible:ring-ring"
              >
                <span
                  class="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-transform duration-300 ease-out motion-reduce:transition-none"
                  :class="isEpisodeSeen(viewSeason, episode.number) ? 'scale-x-100' : 'scale-x-0'"
                  :style="{ transitionDelay: `${fillDelay(episode.number)}ms` }"
                />
              </span>
            </button>
          </div>
        </div>
        <p class="text-center text-xs tabular-nums text-muted-foreground">
          {{ t('Season {season} · {seen} / {total} watched', { season: viewSeason, seen: seenInViewSeason, total: viewEpisodes.length }) }}
        </p>
      </div>
      <!-- Same height as the rail, so the card does not jump once the episodes arrive. -->
      <div v-else-if="catalogs[viewSeason] === undefined" class="flex flex-col gap-2" aria-hidden="true">
        <div class="flex h-9 items-end pb-1.5">
          <span class="h-1.5 w-full animate-pulse rounded-full bg-white/10" />
        </div>
        <span class="mx-auto h-4 w-32 animate-pulse rounded bg-white/10" />
      </div>

      <div class="grid gap-2">
        <template v-if="isSeen">
          <Button type="button" variant="secondary" size="lg" class="w-full rounded-full" @click="unmark">
            <CircleCheckIcon class="mr-2 h-4 w-4 text-emerald-400" aria-hidden="true" />
            {{ t('Watched · undo') }}
          </Button>
          <Button type="button" variant="outline" size="lg" class="w-full rounded-full" @click="emit('discuss', { season: viewSeason, episode: viewEpisode })">
            <MessagesSquareIcon class="mr-2 h-4 w-4" aria-hidden="true" />
            {{ t('Comments') }}
          </Button>
        </template>
        <template v-else>
          <Button type="button" size="lg" class="w-full rounded-full" :disabled="!viewedEpisode" @click="mark">
            <CircleCheckIcon class="mr-2 h-4 w-4" aria-hidden="true" />
            {{ t('Mark as watched') }}
          </Button>
          <Button type="button" variant="outline" size="lg" class="w-full rounded-full" disabled>
            <LockIcon class="mr-2 h-4 w-4" aria-hidden="true" />
            {{ t('Comments') }}
          </Button>
        </template>
        </div>
        <button
          type="button"
          class="inline-flex items-center justify-center gap-1.5 self-center py-1 text-xs font-medium transition-colors"
          :class="revealed ? 'text-amber-300 hover:text-amber-200' : 'text-muted-foreground hover:text-white'"
          :aria-pressed="revealed"
          @click="emit('toggle-reveal')"
        >
          <EyeOffIcon v-if="revealed" class="h-3.5 w-3.5" aria-hidden="true" />
          <EyeIcon v-else class="h-3.5 w-3.5" aria-hidden="true" />
          {{ revealed ? t('Spoilers visible · hide what comes next') : t('Show the entire series') }}
        </button>
      </div>
    </Transition>

    <Dialog v-model:open="pickerOpen">
      <DialogContent class="flex max-h-[85vh] flex-col gap-5 sm:max-w-lg sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>{{ pickerMode === 'set' ? t('Where are you up to?') : t('Choose an episode') }}</DialogTitle>
          <DialogDescription :class="pickerMode === 'set' ? '' : 'sr-only'">
            {{ pickerMode === 'set' ? t('Choose the last episode you watched.') : t('Choose a season, then an episode to display.') }}
          </DialogDescription>
        </DialogHeader>

        <div class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" :aria-label="t('Seasons')">
          <button
            v-for="season in seasons"
            :key="season"
            type="button"
            class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
            :class="pickerSeason === season ? 'border-primary/50 bg-primary/15 text-primary' : 'border-white/10 bg-white/[0.025] text-muted-foreground hover:border-white/20 hover:text-white'"
            :aria-pressed="pickerSeason === season"
            @click="selectPickerSeason(season)"
          >
            <CircleCheckIcon v-if="isSeasonComplete(season)" class="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            {{ t('Season {number}', { number: season }) }}
            <span v-if="!isSeasonComplete(season) && season === reachedSeason && reachedEpisode" class="tabular-nums text-emerald-200">{{ reachedEpisode }}/{{ catalogs[season]?.length || '?' }}</span>
          </button>
        </div>

        <div class="-mx-2 min-h-0 flex-1 overflow-y-auto px-2">
          <div v-if="!catalogs[pickerSeason] && catalogPending" class="grid h-40 place-items-center"><SpinLoader class="h-5 w-5" /></div>
          <p v-else-if="!(catalogs[pickerSeason]?.length)" class="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-muted-foreground">
            {{ t('Episodes for this season are unavailable.') }}
          </p>
          <ol v-else :key="pickerSeason" class="flex flex-col gap-1">
            <li
              v-for="(episode, index) in catalogs[pickerSeason]"
              :key="episode.number"
              class="episode-picker-row"
              :style="{ animationDelay: `${Math.min(index, 12) * 18}ms` }"
            >
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
                :class="isPickerCurrent(episode.number) ? 'border-primary/40 bg-primary/10' : 'border-transparent hover:bg-white/[0.05]'"
                :aria-current="isPickerCurrent(episode.number) ? 'true' : undefined"
                @click="pickEpisode(episode.number)"
              >
                <span
                  class="grid h-9 w-9 shrink-0 place-items-center rounded-full border text-xs font-bold tabular-nums"
                  :class="isEpisodeSeen(pickerSeason, episode.number) ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/10 text-muted-foreground'"
                >
                  {{ episode.number }}
                </span>
                <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ episode.title || t('Episode {number}', { number: episode.number }) }}</span>
                <CircleCheckIcon v-if="isEpisodeSeen(pickerSeason, episode.number)" class="h-4 w-4 shrink-0 text-emerald-400" :aria-label="t('Watched')" />
              </button>
            </li>
          </ol>
        </div>

        <div v-if="reachedSeason" class="flex justify-start border-t border-white/10 pt-4">
          <Button type="button" variant="ghost" size="sm" class="text-muted-foreground" @click="resetProgress">
            {{ t('Reset my progress') }}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CircleCheckIcon, EyeIcon, EyeOffIcon, FastForwardIcon, LockIcon, MessagesSquareIcon, PlayIcon } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Button } from '~/components/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/shadcn/dialog';
import SpinLoader from '~/components/ui/SpinLoader.vue';

type CatalogEpisode = { number: number; title: string; firstAired: string | null };
type EpisodePosition = { season: number; episode: number };

const { t } = useI18n();

const props = defineProps<{
  slug: string;
  // Released seasons, oldest first.
  seasons: number[];
  reachedSeason: number;
  reachedEpisode: number;
  // undecided: the series is not tracked yet, and all of it is visible.
  mode: 'undecided' | 'tracking';
  // Progress is kept, but the page temporarily shows everything.
  revealed: boolean;
  showName: string;
  // The episodes of the season the page already loaded, so the server renders the right episode.
  initialCatalog?: { seasonNumber: number; episodes: CatalogEpisode[] } | null;
}>();

const emit = defineEmits<{
  mark: [position: EpisodePosition];
  discuss: [position: EpisodePosition];
  start: [];
  'toggle-reveal': [];
  reset: [];
}>();

const catalogs = reactive<Record<number, CatalogEpisode[]>>({});
if (props.initialCatalog?.seasonNumber && props.initialCatalog.episodes.length) {
  catalogs[props.initialCatalog.seasonNumber] = props.initialCatalog.episodes
    .filter(isReleased)
    .sort((a, b) => a.number - b.number);
}
const catalogPending = ref(false);
const initialPosition = nextPosition({ season: props.reachedSeason, episode: props.reachedEpisode });
const viewSeason = ref(initialPosition.season);
const viewEpisode = ref(Math.max(1, Math.min(initialPosition.episode, catalogs[initialPosition.season]?.length || initialPosition.episode)));
// A mark keeps the marked episode on screen so its comments can be opened right away.
let keepViewOnNextSync = false;

const viewEpisodes = computed(() => catalogs[viewSeason.value] ?? []);
const viewedEpisode = computed(() => viewEpisodes.value.find(episode => episode.number === viewEpisode.value) ?? null);
const isSeen = computed(() => isEpisodeSeen(viewSeason.value, viewEpisode.value));
const seenInViewSeason = computed(() => viewEpisodes.value.filter(episode => isEpisodeSeen(viewSeason.value, episode.number)).length);
const seasonIndex = computed(() => props.seasons.indexOf(viewSeason.value));
const hasPrevious = computed(() => viewEpisode.value > 1 || seasonIndex.value > 0);
const hasNext = computed(() => viewEpisode.value < viewEpisodes.value.length || seasonIndex.value < props.seasons.length - 1);

// Segments fill (or empty) one after the other, starting from the previous progress.
const previousSeenCount = ref(0);
watch(seenInViewSeason, (_count, previousCount) => {
  previousSeenCount.value = previousCount ?? 0;
}, { flush: 'pre' });

function fillDelay(episodeNumber: number) {
  const from = previousSeenCount.value;
  const to = seenInViewSeason.value;
  if (episodeNumber <= Math.min(from, to) || episodeNumber > Math.max(from, to)) return 0;
  const step = to >= from ? episodeNumber - from - 1 : from - episodeNumber;
  return step * 60;
}

function isEpisodeSeen(season: number, episode: number) {
  if (!props.reachedSeason) return false;
  return season < props.reachedSeason || (season === props.reachedSeason && episode <= props.reachedEpisode);
}

function isReleased(episode: CatalogEpisode) {
  return !episode.firstAired || new Date(episode.firstAired).getTime() <= Date.now();
}

async function loadCatalog(season: number) {
  if (!season || catalogs[season]) return catalogs[season] ?? [];
  catalogPending.value = true;
  try {
    const response = await $fetch<{ episodes: CatalogEpisode[] }>(`/api/shows/${props.slug}/seasons/${season}/episodes`);
    catalogs[season] = response.episodes.filter(isReleased).sort((a, b) => a.number - b.number);
  } catch {
    catalogs[season] = [];
  } finally {
    catalogPending.value = false;
  }
  return catalogs[season];
}

// The episode after the last one seen: the start of the series without progress.
function nextPosition(position: EpisodePosition): EpisodePosition {
  if (!position.season) return { season: props.seasons[0] ?? 1, episode: 1 };
  const total = catalogs[position.season]?.length ?? 0;
  if (position.episode < total || !total) return { season: position.season, episode: position.episode + 1 };
  const nextSeason = props.seasons[props.seasons.indexOf(position.season) + 1];
  return nextSeason ? { season: nextSeason, episode: 1 } : position;
}

async function syncWithProgress() {
  if (keepViewOnNextSync) {
    keepViewOnNextSync = false;
    return;
  }
  if (props.reachedSeason) await loadCatalog(props.reachedSeason);
  const next = nextPosition({ season: props.reachedSeason, episode: props.reachedEpisode });
  await loadCatalog(next.season);
  viewSeason.value = next.season;
  viewEpisode.value = Math.max(1, Math.min(next.episode, catalogs[next.season]?.length || next.episode));
}

async function goPrevious() {
  if (viewEpisode.value > 1) {
    viewEpisode.value -= 1;
    return;
  }
  const previousSeason = props.seasons[seasonIndex.value - 1];
  if (!previousSeason) return;
  const episodes = await loadCatalog(previousSeason);
  viewSeason.value = previousSeason;
  viewEpisode.value = Math.max(1, episodes.length);
}

async function goNext() {
  if (viewEpisode.value < viewEpisodes.value.length) {
    viewEpisode.value += 1;
    return;
  }
  const nextSeason = props.seasons[seasonIndex.value + 1];
  if (!nextSeason) return;
  await loadCatalog(nextSeason);
  viewSeason.value = nextSeason;
  viewEpisode.value = 1;
}

const pickerOpen = ref(false);
const pickerSeason = ref(viewSeason.value);
// view: show an episode in the card; set: mark everything up to the chosen episode as seen.
const pickerMode = ref<'view' | 'set'>('view');

function openPicker(mode: 'view' | 'set') {
  pickerMode.value = mode;
  pickerSeason.value = viewSeason.value;
  loadCatalog(pickerSeason.value);
  pickerOpen.value = true;
}

function selectPickerSeason(season: number) {
  pickerSeason.value = season;
  loadCatalog(season);
}

function isPickerCurrent(episode: number) {
  return pickerMode.value === 'view' && pickerSeason.value === viewSeason.value && episode === viewEpisode.value;
}

function pickEpisode(episode: number) {
  if (pickerMode.value === 'set') {
    pickerOpen.value = false;
    emit('mark', { season: pickerSeason.value, episode });
    return;
  }
  viewSeason.value = pickerSeason.value;
  viewEpisode.value = episode;
  pickerOpen.value = false;
}

function isSeasonComplete(season: number) {
  if (!props.reachedSeason) return false;
  if (season < props.reachedSeason) return true;
  const total = catalogs[season]?.length ?? 0;
  return season === props.reachedSeason && total > 0 && props.reachedEpisode >= total;
}

function resetProgress() {
  pickerOpen.value = false;
  emit('reset');
}

function mark() {
  keepViewOnNextSync = true;
  emit('mark', { season: viewSeason.value, episode: viewEpisode.value });
}

function unmark() {
  keepViewOnNextSync = true;
  emit('mark', { season: viewSeason.value, episode: viewEpisode.value - 1 });
}

// A string key: the parent hands a new seasons array on every render.
watch(() => `${props.reachedSeason}:${props.reachedEpisode}:${props.seasons.join(',')}`, syncWithProgress);
onMounted(syncWithProgress);
</script>

<style>
/* The card's states cross-fade with a slight rise. */
.tracker-swap-enter-active,
.tracker-swap-leave-active {
  transition: opacity 220ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.tracker-swap-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.tracker-swap-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Episodes appear one after the other when the list opens or changes season. */
.episode-picker-row {
  animation: episode-picker-row-in 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes episode-picker-row-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .tracker-swap-enter-from,
  .tracker-swap-leave-to {
    transform: none;
  }

  .episode-picker-row {
    animation: none;
  }
}
</style>
