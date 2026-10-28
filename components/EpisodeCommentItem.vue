<template>
  <!-- A double tap anywhere on the message likes it, as on a phone's photo feed. -->
  <article class="relative flex select-none gap-3 [touch-action:manipulation] sm:select-text" @pointerup="onMessageTap" @mousedown="preventDoubleClickSelection">
    <HeartIcon
      v-if="likeBurst"
      :key="likeBurst"
      class="like-burst pointer-events-none absolute left-1/2 top-1/2 z-10 h-14 w-14 fill-rose-500 text-rose-500 drop-shadow-[0_4px_16px_rgba(244,63,94,0.45)]"
      aria-hidden="true"
      @animationend="likeBurst = 0"
    />
    <Avatar class="shrink-0" :class="isReply ? 'h-7 w-7' : 'h-9 w-9'">
      <AvatarImage v-if="comment.authorAvatarUrl" :src="comment.authorAvatarUrl" alt="" />
      <AvatarFallback class="bg-white/10 text-xs font-semibold">{{ initial }}</AvatarFallback>
    </Avatar>
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span class="truncate text-sm font-semibold">{{ comment.authorName || t('A viewer') }}</span>
        <span v-if="comment.isOwn" class="shrink-0 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-semibold text-primary">{{ t('You') }}</span>
        <time class="shrink-0 text-xs text-muted-foreground" :datetime="comment.createdAt" :title="absoluteDate">{{ relativeDate }}</time>
        <span v-if="comment.isSpoiler" class="shrink-0 rounded-full bg-amber-400/15 px-1.5 py-px text-[10px] font-semibold text-amber-300">{{ t('Spoiler') }}</span>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button type="button" class="-my-1 ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-white" :aria-label="t('Comment options')">
              <EllipsisIcon class="h-4 w-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-56 rounded-xl">
            <!-- Once viewers reported it, the author can no longer show it in the clear. -->
            <DropdownMenuItem v-if="comment.isOwn && comment.reportedAsSpoiler" disabled>
              <EyeOffIcon aria-hidden="true" />
              {{ t('Reported as a spoiler by viewers') }}
            </DropdownMenuItem>
            <DropdownMenuItem v-else-if="comment.isOwn" class="cursor-pointer" @click="emit('toggle-spoiler', !comment.markedSpoilerByAuthor)">
              <EyeIcon v-if="comment.markedSpoilerByAuthor" aria-hidden="true" />
              <EyeOffIcon v-else aria-hidden="true" />
              {{ comment.markedSpoilerByAuthor ? t('Not a spoiler') : t('Mark as spoiler') }}
            </DropdownMenuItem>
            <DropdownMenuItem v-if="comment.isOwn" class="cursor-pointer text-red-300 focus:text-red-200" @click="emit('remove', false)">
              <Trash2Icon aria-hidden="true" />
              {{ t('Delete my comment') }}
            </DropdownMenuItem>
            <DropdownMenuItem v-if="!comment.isOwn" class="cursor-pointer" :disabled="comment.isSpoilerReported" @click="emit('report-spoiler')">
              <EyeOffIcon aria-hidden="true" />
              {{ comment.isSpoilerReported ? t('Reported as a spoiler') : t('Report a spoiler') }}
            </DropdownMenuItem>
            <DropdownMenuItem v-if="!comment.isOwn" class="cursor-pointer" :disabled="comment.isReported" @click="emit('report')">
              <FlagIcon aria-hidden="true" />
              {{ comment.isReported ? t('Reported') : t('Report') }}
            </DropdownMenuItem>
            <DropdownMenuItem v-if="isAdmin && !comment.isOwn" class="cursor-pointer text-red-300 focus:text-red-200" @click="emit('remove', true)">
              <ShieldXIcon aria-hidden="true" />
              {{ t('Delete as moderator') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <!-- A spoiler stays blurred until the viewer asks for it; its author always reads it. -->
      <div v-if="isSpoilerHidden" class="relative mt-1 min-h-10 overflow-hidden rounded-lg">
        <p class="pointer-events-none select-none whitespace-pre-line break-words text-[15px] leading-6 text-white/85 blur-[6px]" aria-hidden="true">{{ comment.body }}</p>
        <button
          type="button"
          class="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 text-xs font-semibold text-amber-200 transition-colors hover:bg-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300"
          @click="revealed = true"
        >
          <EyeOffIcon class="h-4 w-4" aria-hidden="true" />
          {{ t('Spoiler · tap to reveal') }}
        </button>
      </div>
      <p v-else class="mt-1 whitespace-pre-line break-words text-[15px] leading-6 text-white/85">
        <template v-for="(part, index) in bodyParts" :key="index">
          <span v-if="part.mention" class="rounded bg-primary/15 px-1 py-px font-semibold text-primary">{{ part.text }}</span>
          <template v-else>{{ part.text }}</template>
        </template>
      </p>

      <div class="-ml-1.5 mt-2 flex flex-wrap items-center gap-1">
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-xs font-semibold tabular-nums transition-colors"
          :class="comment.isLiked ? 'text-rose-400 hover:bg-rose-500/10' : 'text-muted-foreground hover:bg-white/[0.06] hover:text-white'"
          :aria-pressed="comment.isLiked"
          :aria-label="comment.likeCount ? t('Like · {count}', { count: comment.likeCount }) : t('Like')"
          @click="emit('like', !comment.isLiked)"
        >
          <HeartIcon :key="String(comment.isLiked)" class="h-4 w-4" :class="comment.isLiked ? 'like-pop fill-current' : ''" aria-hidden="true" />
          <span v-if="comment.likeCount" aria-hidden="true">{{ comment.likeCount }}</span>
        </button>
        <button type="button" class="h-7 rounded-full px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-white" @click="emit('reply')">
          {{ t('Reply') }}
        </button>
        <button
          v-if="replyCount"
          type="button"
          class="h-7 rounded-full px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-white"
          :aria-expanded="!repliesHidden"
          @click="emit('toggle-replies')"
        >
          {{ !repliesHidden ? t('Hide replies') : replyCount > 1 ? t('View {count} replies', { count: replyCount }) : t('View 1 reply') }}
        </button>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { EllipsisIcon, EyeIcon, EyeOffIcon, FlagIcon, HeartIcon, ShieldXIcon, Trash2Icon } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/shadcn/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/shadcn/dropdown-menu';
import type { EpisodeComment } from '~/types/episode-comment.types';

const props = defineProps<{
  comment: EpisodeComment;
  isAdmin: boolean;
  // Authors of the thread: `@` followed by one of them is shown as a mention.
  mentionableNames?: string[];
  // On a top-level comment: its replies, which this message can fold away.
  replyCount?: number;
  repliesHidden?: boolean;
}>();

const emit = defineEmits<{
  remove: [asModerator: boolean];
  report: [];
  like: [active: boolean];
  reply: [];
  'toggle-replies': [];
  'toggle-spoiler': [isSpoiler: boolean];
  'report-spoiler': [];
}>();

const { t, locale } = useI18n();

const isReply = computed(() => !!props.comment.parentId);
const revealed = ref(false);
const isSpoilerHidden = computed(() => props.comment.isSpoiler && !props.comment.isOwn && !revealed.value);
const initial = computed(() => (props.comment.authorName?.trim()[0] ?? '?').toLocaleUpperCase());

// The body cut into text and mentions; the longest names come first, so `@Ann Lee` wins over `@Ann`.
const bodyParts = computed(() => {
  const names = [...(props.mentionableNames ?? [])].sort((a, b) => b.length - a.length);
  if (!names.length) return [{ text: props.comment.body, mention: false }];
  const escaped = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`@(?:${escaped.join('|')})(?![\\p{L}\\p{N}_])`, 'gu');
  const parts: Array<{ text: string; mention: boolean }> = [];
  let last = 0;
  for (const match of props.comment.body.matchAll(pattern)) {
    if (match.index > last) parts.push({ text: props.comment.body.slice(last, match.index), mention: false });
    parts.push({ text: match[0], mention: true });
    last = match.index + match[0].length;
  }
  if (last < props.comment.body.length) parts.push({ text: props.comment.body.slice(last), mention: false });
  return parts;
});

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DISTANCE = 24;

// Bumped on each double tap so the burst plays again.
const likeBurst = ref(0);
let lastTap: { time: number; x: number; y: number } | null = null;

function onMessageTap(event: PointerEvent) {
  if (event.button !== 0 || (event.target as HTMLElement).closest('button, a, [role="menuitem"]')) {
    lastTap = null;
    return;
  }
  const tap = { time: event.timeStamp, x: event.clientX, y: event.clientY };
  const isDoubleTap = lastTap
    && tap.time - lastTap.time < DOUBLE_TAP_MS
    && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < DOUBLE_TAP_DISTANCE;
  lastTap = isDoubleTap ? null : tap;
  if (!isDoubleTap) return;
  // A double tap only ever likes; the heart takes it back.
  likeBurst.value += 1;
  if (!props.comment.isLiked) emit('like', true);
}

// A double click would otherwise select a word of the message.
function preventDoubleClickSelection(event: MouseEvent) {
  if (event.detail > 1 && !(event.target as HTMLElement).closest('button, a')) event.preventDefault();
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60],
];

const relativeDate = computed(() => {
  const seconds = (new Date(props.comment.createdAt).getTime() - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto', style: 'short' });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return t('just now');
});

const absoluteDate = computed(() => new Date(props.comment.createdAt)
  .toLocaleString(locale.value, { dateStyle: 'long', timeStyle: 'short' }));
</script>

<style>
/* A double tap makes a heart pop over the message, then fade away. */
.like-burst {
  animation: like-burst 700ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes like-burst {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
  25% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
  45% { transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -60%) scale(1); }
}

/* The small heart bounces once when it fills. */
.like-pop {
  animation: like-pop 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes like-pop {
  0% { transform: scale(0.6); }
  55% { transform: scale(1.25); }
  100% { transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .like-burst {
    animation: none;
    opacity: 0;
  }

  .like-pop {
    animation: none;
  }
}
</style>
