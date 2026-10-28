<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <!-- Locks the page's scrolling for as long as the view is open, so menus opened inside it do not shift it. -->
      <DialogOverlay class="episode-comments-overlay fixed inset-0 z-50 bg-background" />
      <DialogContent
        class="episode-comments fixed inset-0 z-50 flex flex-col bg-background text-foreground outline-none"
        @open-auto-focus.prevent="focusComposer"
      >
        <header class="shrink-0 border-b border-white/10 bg-background/85 backdrop-blur-xl [padding-top:env(safe-area-inset-top)]">
          <div class="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
            <DialogClose
              class="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :aria-label="t('Close')"
            >
              <ArrowLeftIcon class="h-5 w-5" aria-hidden="true" />
            </DialogClose>
            <div class="min-w-0 flex-1">
              <DialogTitle class="flex items-baseline gap-2 text-lg font-bold leading-6">
                {{ t('Comments') }}
                <span v-if="commentCount" class="text-sm font-medium tabular-nums text-muted-foreground">{{ commentCount }}</span>
              </DialogTitle>
              <DialogDescription class="truncate text-[13px] text-muted-foreground">
                {{ showName }} · S{{ season }} · E{{ episode }}<template v-if="episodeTitle"> · {{ episodeTitle }}</template>
              </DialogDescription>
            </div>
          </div>
        </header>

        <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div class="mx-auto flex max-w-2xl flex-col px-4 pb-6 pt-4 sm:px-6">
            <div v-if="status === 'loading'" class="mt-2 flex flex-col gap-5" aria-hidden="true">
              <div v-for="index in 4" :key="index" class="flex gap-3">
                <span class="h-9 w-9 shrink-0 animate-pulse rounded-full bg-white/10" />
                <div class="flex flex-1 flex-col gap-2 pt-1">
                  <span class="h-3 w-28 animate-pulse rounded bg-white/10" />
                  <span class="h-3 animate-pulse rounded bg-white/10" :class="index % 2 ? 'w-4/5' : 'w-3/5'" />
                </div>
              </div>
            </div>

            <div v-else-if="status === 'locked' || status === 'error'" class="mt-16 text-center">
              <component :is="status === 'locked' ? LockIcon : MessageSquareWarningIcon" class="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
              <h3 class="mt-4 font-semibold">{{ status === 'locked' ? t('These comments are protected') : t('Could not load the comments.') }}</h3>
              <p class="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                {{ status === 'locked' ? t('Mark this episode as watched to read its comments.') : t('Please try again in a moment.') }}
              </p>
              <Button v-if="status === 'error'" type="button" variant="outline" class="mt-5 rounded-full" @click="load">{{ t('Retry') }}</Button>
            </div>

            <div v-else-if="!comments.length" class="mt-16 text-center">
              <MessagesSquareIcon class="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
              <h3 class="mt-4 font-semibold">{{ t('No comments on episode {number}', { number: episode }) }}</h3>
              <p class="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{{ t('Be the first to share what you thought of it.') }}</p>
            </div>

            <ol v-else class="mt-2 flex flex-col" :aria-label="t('Comments')">
              <li v-for="comment in comments" :id="`episode-comment-${comment.id}`" :key="comment.id" class="episode-comment border-b border-white/[0.06] py-4 last:border-b-0">
                <EpisodeCommentItem
                  :comment="comment"
                  :is-admin="isAdmin"
                  :mentionable-names="threadNames(comment)"
                  :reply-count="comment.replies.length"
                  :replies-hidden="hiddenThreads.has(comment.id)"
                  @remove="remove(comment, $event)"
                  @report="report(comment)"
                  @like="like(comment, $event)"
                  @reply="startReply(comment, comment)"
                  @toggle-spoiler="setSpoiler(comment, $event)"
                  @report-spoiler="reportSpoiler(comment)"
                  @toggle-replies="hiddenThreads.has(comment.id) ? showThread(comment.id) : hideThread(comment.id)"
                />
                <div v-if="comment.replies.length && !hiddenThreads.has(comment.id)" class="ml-12 mt-3">
                  <ol class="flex flex-col gap-4 border-l border-white/10 pl-4" :aria-label="t('Replies')">
                    <li v-for="reply in visibleReplies(comment)" :id="`episode-comment-${reply.id}`" :key="reply.id" class="episode-comment">
                      <EpisodeCommentItem
                        :comment="reply"
                        :is-admin="isAdmin"
                        :mentionable-names="threadNames(comment)"
                        @remove="remove(reply, $event)"
                        @report="report(reply)"
                        @like="like(reply, $event)"
                        @reply="startReply(comment, reply)"
                        @toggle-spoiler="setSpoiler(reply, $event)"
                        @report-spoiler="reportSpoiler(reply)"
                      />
                    </li>
                  </ol>
                  <!-- The thread reads in order: the later replies wait below the first ones. -->
                  <button
                    v-if="comment.replies.length > COLLAPSED_REPLIES && !expandedThreads.has(comment.id)"
                    type="button"
                    class="ml-4 mt-3 text-xs font-semibold text-primary hover:underline"
                    @click="expandThread(comment.id)"
                  >
                    {{ comment.replies.length - COLLAPSED_REPLIES > 1
                      ? t('View {count} more replies', { count: comment.replies.length - COLLAPSED_REPLIES })
                      : t('View 1 more reply') }}
                  </button>
                </div>
              </li>
            </ol>
          </div>
        </div>

        <form
          v-if="status === 'ready' || status === 'loading'"
          class="shrink-0 border-t border-white/10 bg-background/95 backdrop-blur-xl [padding-bottom:env(safe-area-inset-bottom)]"
          @submit.prevent="submit"
        >
          <div v-if="replyTarget" class="mx-auto flex max-w-2xl items-center gap-2 px-4 pt-2.5 text-xs text-muted-foreground sm:px-6">
            <CornerDownRightIcon class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ t('Replying to {name}', { name: replyTarget.name }) }}</span>
            <button type="button" class="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-white/[0.06] hover:text-white" :aria-label="t('Cancel the reply')" @click="cancelReply">
              <XIcon class="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div class="mx-auto flex max-w-2xl items-end gap-2 px-4 py-3 sm:px-6">
            <label for="episode-comment-body" class="sr-only">{{ t('Your comment') }}</label>
            <button
              type="button"
              class="grid h-11 w-11 shrink-0 place-items-center rounded-full border transition-colors"
              :class="draftIsSpoiler ? 'border-amber-400/40 bg-amber-400/15 text-amber-300' : 'border-transparent text-muted-foreground hover:bg-white/[0.06] hover:text-white'"
              :aria-pressed="draftIsSpoiler"
              :aria-label="t('Mark as spoiler')"
              :title="draftIsSpoiler ? t('Hidden as a spoiler until revealed') : t('Mark as spoiler')"
              @click="draftIsSpoiler = !draftIsSpoiler"
            >
              <EyeOffIcon class="h-5 w-5" aria-hidden="true" />
            </button>
            <div class="relative min-w-0 flex-1">
              <textarea
                id="episode-comment-body"
                ref="composer"
                v-model="draft"
                rows="1"
                :maxlength="MAX_LENGTH"
                :placeholder="draftIsSpoiler ? t('Write a spoiler…') : replyTarget ? t('Write a reply…') : t('Add a comment about episode {number}…', { number: episode })"
                class="block max-h-40 min-h-11 w-full resize-none overflow-y-hidden rounded-[22px] [scrollbar-width:thin] border border-white/15 bg-white/[0.04] px-4 py-2.5 text-[15px] leading-6 placeholder:text-muted-foreground focus-visible:border-white/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                @input="resizeComposer"
                @keydown.enter.exact="sendOnEnter"
                @keydown.esc="onComposerEscape"
              />
              <span v-if="draft.length > MAX_LENGTH - 200" class="pointer-events-none absolute -top-5 right-2 text-[11px] tabular-nums text-muted-foreground">{{ draft.length }} / {{ MAX_LENGTH }}</span>
            </div>
            <Button type="submit" size="icon" class="h-11 w-11 shrink-0 rounded-full" :disabled="!draft.trim() || sending || status !== 'ready'" :aria-label="t('Post')">
              <SpinLoader v-if="sending" class="h-4 w-4" />
              <SendHorizontalIcon v-else class="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { ArrowLeftIcon, CornerDownRightIcon, EyeOffIcon, LockIcon, MessageSquareWarningIcon, MessagesSquareIcon, SendHorizontalIcon, XIcon } from 'lucide-vue-next';
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { computed, nextTick, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import EpisodeCommentItem from '~/components/EpisodeCommentItem.vue';
import { Button } from '~/components/shadcn/button';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import type { EpisodeComment } from '~/types/episode-comment.types';

const MAX_LENGTH = 2000;
// The server sends at most this many comments; beyond it, the count comes from the server.
const PAGE_SIZE = 200;
// Long threads show their first replies; the later ones open on demand.
const COLLAPSED_REPLIES = 3;

const props = defineProps<{
  slug: string;
  showName: string;
  season: number;
  episode: number;
  episodeTitle?: string | null;
}>();
const open = defineModel<boolean>('open', { required: true });

const { t } = useI18n();
const { countOf, setCount } = useEpisodeCommentCounts(props.slug);
const isAdmin = useIsAdmin();
const commentCount = computed(() => countOf(props.season, props.episode) ?? totalOf(comments.value));

// locked: the viewer's saved progress does not reach this episode yet.
const status = ref<'loading' | 'ready' | 'locked' | 'error'>('loading');
const comments = ref<EpisodeComment[]>([]);
const draft = ref('');
// Set from the composer's eye button: the comment is posted hidden as a spoiler.
const draftIsSpoiler = ref(false);
const sending = ref(false);
const composer = ref<HTMLTextAreaElement | null>(null);
const scroller = ref<HTMLElement | null>(null);
// Replies always attach to a top-level comment, whichever message of the thread was answered.
const replyTarget = ref<{ parentId: string; name: string } | null>(null);
// The `@name ` put at the start of the draft by the last reply, if any.
let insertedMention = '';
const expandedThreads = ref(new Set<string>());

function totalOf(list: EpisodeComment[]) {
  return list.reduce((total, comment) => total + 1 + comment.replies.length, 0);
}

function visibleReplies(comment: EpisodeComment) {
  return expandedThreads.value.has(comment.id) ? comment.replies : comment.replies.slice(0, COLLAPSED_REPLIES);
}

// Folded threads keep only a button with their reply count.
const hiddenThreads = ref(new Set<string>());

function hideThread(id: string) {
  hiddenThreads.value = new Set([...hiddenThreads.value, id]);
}

// The button promised every reply, so the thread opens in full.
function showThread(id: string) {
  hiddenThreads.value = new Set([...hiddenThreads.value].filter(threadId => threadId !== id));
  expandThread(id);
}

function expandThread(id: string) {
  expandedThreads.value = new Set([...expandedThreads.value, id]);
}

// Applies a change to a comment, wherever it sits in the threads.
function updateComment(id: string, change: (comment: EpisodeComment) => EpisodeComment) {
  comments.value = comments.value.map(comment => comment.id === id
    ? change(comment)
    : { ...comment, replies: comment.replies.map(reply => reply.id === id ? change(reply) : reply) });
}

const endpoint = () => `/api/shows/${props.slug}/seasons/${props.season}/episodes/${props.episode}/comments`;

async function load() {
  status.value = 'loading';
  const requested = endpoint();
  try {
    const response = await $fetch<{ comments: EpisodeComment[] }>(requested);
    // The viewer may have switched episode while this one was loading.
    if (requested !== endpoint()) return;
    comments.value = response.comments;
    if (response.comments.length < PAGE_SIZE) setCount(props.season, props.episode, totalOf(response.comments));
    status.value = 'ready';
  } catch (cause: any) {
    if (requested !== endpoint()) return;
    status.value = cause?.statusCode === 403 ? 'locked' : 'error';
  }
}

// Each opening starts from the episode's latest comments; a draft survives for the same episode.
watch(open, (isOpen) => {
  if (isOpen) load();
}, { immediate: true });
watch(() => `${props.season}:${props.episode}`, () => {
  draft.value = '';
  draftIsSpoiler.value = false;
  replyTarget.value = null;
  insertedMention = '';
  expandedThreads.value = new Set();
  hiddenThreads.value = new Set();
  if (open.value) load();
});

function focusComposer() {
  // On a phone the keyboard would hide the comments the viewer came to read.
  if (window.matchMedia('(pointer: fine)').matches) nextTick(() => composer.value?.focus());
}

function resizeComposer() {
  const element = composer.value;
  if (!element) return;
  element.style.height = 'auto';
  // scrollHeight leaves out the border: without it the field is always a little short and shows a scrollbar.
  const borders = element.offsetHeight - element.clientHeight;
  const height = element.scrollHeight + borders;
  const maxHeight = parseFloat(getComputedStyle(element).maxHeight);
  element.style.height = `${height}px`;
  // A scrollbar only once the text outgrows the tallest field.
  element.style.overflowY = height > maxHeight ? 'auto' : 'hidden';
}

// Enter sends on a keyboard; on a touch screen it stays a line break.
function sendOnEnter(event: KeyboardEvent) {
  if (event.isComposing || !window.matchMedia('(pointer: fine)').matches) return;
  event.preventDefault();
  submit();
}

// The people of a thread, whose names are shown as mentions in its messages.
function threadNames(parent: EpisodeComment) {
  return [...new Set([parent, ...parent.replies].map(comment => comment.authorName).filter((name): name is string => !!name))];
}

// Replies all sit at one level, so answering a reply names its author to keep the conversation clear.
function startReply(parent: EpisodeComment, answered: EpisodeComment) {
  replyTarget.value = { parentId: parent.id, name: answered.authorName || t('A viewer') };
  // A mention added for an earlier reply gives way to the new one; the rest of the draft stays.
  const rest = insertedMention && draft.value.startsWith(insertedMention)
    ? draft.value.slice(insertedMention.length)
    : draft.value;
  insertedMention = answered.id !== parent.id && answered.authorName && !answered.isOwn
    ? `@${answered.authorName} `
    : '';
  draft.value = insertedMention + rest;
  nextTick(() => {
    const element = composer.value;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
    resizeComposer();
  });
}

// Leaving a reply also takes back the mention it added.
function leaveReply() {
  replyTarget.value = null;
  if (insertedMention && draft.value.startsWith(insertedMention)) draft.value = draft.value.slice(insertedMention.length);
  insertedMention = '';
  nextTick(resizeComposer);
}

function cancelReply() {
  leaveReply();
  composer.value?.focus();
}

// Escape first leaves the reply, then closes the view.
function onComposerEscape(event: KeyboardEvent) {
  if (!replyTarget.value) return;
  event.stopPropagation();
  event.preventDefault();
  leaveReply();
}

async function submit() {
  const body = draft.value.trim();
  if (!body || sending.value || status.value !== 'ready') return;
  sending.value = true;
  try {
    const parentId = replyTarget.value?.parentId ?? null;
    const { comment } = await $fetch<{ comment: EpisodeComment }>(endpoint(), { method: 'POST', body: { body, parentId, isSpoiler: draftIsSpoiler.value } });
    if (parentId) {
      updateComment(parentId, parent => ({ ...parent, replies: [...parent.replies, comment] }));
      // A new reply is shown even in a folded thread.
      showThread(parentId);
    } else {
      comments.value = [comment, ...comments.value];
    }
    setCount(props.season, props.episode, commentCount.value + 1);
    draft.value = '';
    draftIsSpoiler.value = false;
    replyTarget.value = null;
    insertedMention = '';
    await nextTick();
    resizeComposer();
    if (parentId) document.getElementById(`episode-comment-${comment.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    else scroller.value?.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (cause: any) {
    toast.error(t('Could not post your comment.'), { description: cause?.data?.statusMessage ? t(cause.data.statusMessage) : undefined });
  } finally {
    sending.value = false;
  }
}

// A moderator removes any comment; everyone else only their own.
async function remove(comment: EpisodeComment, asModerator = false) {
  const previous = comments.value;
  const previousCount = commentCount.value;
  // A comment leaves with its replies.
  comments.value = previous
    .filter(item => item.id !== comment.id)
    .map(item => ({ ...item, replies: item.replies.filter(reply => reply.id !== comment.id) }));
  if (replyTarget.value?.parentId === comment.id) replyTarget.value = null;
  setCount(props.season, props.episode, previousCount - 1 - comment.replies.length);
  try {
    await $fetch(asModerator ? `/api/admin/comments/${comment.id}` : `/api/comments/${comment.id}`, { method: 'DELETE' });
  } catch {
    comments.value = previous;
    setCount(props.season, props.episode, previousCount);
    toast.error(t('Could not delete this comment.'));
  }
}

async function report(comment: EpisodeComment) {
  try {
    await $fetch(`/api/comments/${comment.id}/report`, { method: 'POST' });
    updateComment(comment.id, item => ({ ...item, isReported: true }));
    toast.success(t('Thanks, the team will review this comment.'));
  } catch {
    toast.error(t('Could not report this comment.'));
  }
}

function withLike(item: EpisodeComment, active: boolean): EpisodeComment {
  if (item.isLiked === active) return item;
  return { ...item, isLiked: active, likeCount: Math.max(0, item.likeCount + (active ? 1 : -1)) };
}

async function like(comment: EpisodeComment, active: boolean) {
  updateComment(comment.id, item => withLike(item, active));
  try {
    await $fetch(`/api/comments/${comment.id}/like`, { method: 'PUT', body: { active } });
  } catch {
    updateComment(comment.id, item => withLike(item, !active));
    toast.error(t('Could not save your like.'));
  }
}

// The author's own flag; viewers' reports keep a comment hidden whatever it says.
function withAuthorSpoiler(item: EpisodeComment, marked: boolean): EpisodeComment {
  return { ...item, markedSpoilerByAuthor: marked, isSpoiler: marked || item.reportedAsSpoiler };
}

async function setSpoiler(comment: EpisodeComment, isSpoiler: boolean) {
  updateComment(comment.id, item => withAuthorSpoiler(item, isSpoiler));
  try {
    await $fetch(`/api/comments/${comment.id}`, { method: 'PATCH', body: { isSpoiler } });
  } catch {
    updateComment(comment.id, item => withAuthorSpoiler(item, !isSpoiler));
    toast.error(t('Could not update this comment.'));
  }
}

// The reporter already read it: the comment is only hidden for others once enough viewers agree.
async function reportSpoiler(comment: EpisodeComment) {
  try {
    const { reportedAsSpoiler } = await $fetch<{ reportedAsSpoiler: boolean }>(`/api/comments/${comment.id}/spoiler-report`, { method: 'POST' });
    updateComment(comment.id, item => ({
      ...item,
      isSpoilerReported: true,
      reportedAsSpoiler,
      isSpoiler: item.markedSpoilerByAuthor || reportedAsSpoiler,
    }));
    toast.success(t('Thanks, this helps hide spoilers from others.'));
  } catch {
    toast.error(t('Could not report this spoiler.'));
  }
}
</script>

<style>
/* The page slides up into a full-screen view, and back down when it closes. */
.episode-comments[data-state='open'] {
  animation: episode-comments-in 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

.episode-comments[data-state='closed'] {
  animation: episode-comments-out 200ms ease-in;
}

.episode-comments-overlay[data-state='open'] {
  animation: episode-comments-fade-in 280ms ease-out;
}

.episode-comments-overlay[data-state='closed'] {
  animation: episode-comments-fade-out 200ms ease-in;
}

.episode-comment {
  animation: episode-comment-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes episode-comments-in {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes episode-comments-out {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(24px); }
}

@keyframes episode-comments-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes episode-comments-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes episode-comment-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .episode-comments[data-state='open'],
  .episode-comments[data-state='closed'],
  .episode-comments-overlay[data-state='open'],
  .episode-comments-overlay[data-state='closed'],
  .episode-comment {
    animation: none;
  }
}
</style>
