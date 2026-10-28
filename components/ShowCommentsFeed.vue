<template>
  <!-- Every episode's comments in one feed, the most liked first, each with the episode it was written on. -->
  <div>
    <div v-if="status === 'loading'" class="flex flex-col gap-5" aria-hidden="true">
      <div v-for="index in 3" :key="index" class="flex gap-3">
        <span class="h-8 w-8 shrink-0 animate-pulse rounded-full bg-white/10" />
        <div class="flex flex-1 flex-col gap-2 pt-1">
          <span class="h-3 w-32 animate-pulse rounded bg-white/10" />
          <span class="h-3 animate-pulse rounded bg-white/10" :class="index % 2 ? 'w-4/5' : 'w-3/5'" />
        </div>
      </div>
    </div>

    <div v-else-if="status === 'error'" class="py-10 text-center">
      <p class="text-sm text-muted-foreground">{{ t('Could not load the comments.') }}</p>
      <Button type="button" variant="outline" class="mt-4 rounded-full" @click="load()">{{ t('Retry') }}</Button>
    </div>

    <div v-else-if="!items.length" class="py-10 text-center">
      <MessagesSquareIcon class="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
      <h3 class="mt-4 font-semibold">{{ t('No comments yet') }}</h3>
      <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {{ t('Comments from the episodes you have watched show up here. Open an episode from the tracker to write the first one.') }}
      </p>
    </div>

    <template v-else>
      <ol class="flex flex-col divide-y divide-white/[0.06]" :aria-label="t('Comments')">
        <li v-for="item in items" :key="item.comment.id" class="py-4 first:pt-0">
          <CommentAuthorLine
            :name="item.comment.authorName"
            :avatar-url="item.comment.authorAvatarUrl"
            :date="item.comment.createdAt"
            :is-own="item.comment.isOwn"
          >
            <button
              type="button"
              class="ml-auto shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white/70 transition-colors hover:border-white/25 hover:text-white"
              :aria-label="t('Open the comments of season {season}, episode {episode}', { season: item.season, episode: item.episode })"
              @click="emit('open-episode', { season: item.season, episode: item.episode })"
            >
              S{{ item.season }} · E{{ item.episode }}
            </button>
          </CommentAuthorLine>
          <div class="pl-10">
            <!-- A spoiler stays blurred until the viewer asks for it. -->
            <div v-if="item.comment.isSpoiler && !item.comment.isOwn && !revealed.has(item.comment.id)" class="relative mt-1 min-h-10 overflow-hidden rounded-lg">
              <p class="pointer-events-none select-none whitespace-pre-line break-words text-[15px] leading-6 text-white/85 blur-[6px]" aria-hidden="true">{{ item.comment.body }}</p>
              <button
                type="button"
                class="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 text-xs font-semibold text-amber-200 transition-colors hover:bg-black/30"
                @click="reveal(item.comment.id)"
              >
                <EyeOffIcon class="h-4 w-4" aria-hidden="true" />
                {{ t('Spoiler · tap to reveal') }}
              </button>
            </div>
            <p v-else class="mt-1 line-clamp-6 whitespace-pre-line break-words text-[15px] leading-6 text-white/85">{{ item.comment.body }}</p>
            <div class="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span v-if="item.comment.likeCount" class="inline-flex items-center gap-1 tabular-nums">
                <HeartIcon class="h-3.5 w-3.5" aria-hidden="true" />{{ item.comment.likeCount }}
              </span>
              <button
                type="button"
                class="font-semibold transition-colors hover:text-white"
                @click="emit('open-episode', { season: item.season, episode: item.episode })"
              >
                {{ t('View') }}
              </button>
            </div>
          </div>
        </li>
      </ol>
      <div v-if="hasMore" class="mt-4 flex justify-center">
        <Button type="button" variant="outline" class="rounded-full" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? t('Loading…') : t('Show more comments') }}
        </Button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { EyeOffIcon, HeartIcon, MessagesSquareIcon } from 'lucide-vue-next';
import { onMounted, ref, watch } from 'vue';
import { Button } from '~/components/shadcn/button';
import CommentAuthorLine from '~/components/CommentAuthorLine.vue';
import type { ShowFeedComment } from '~/types/episode-comment.types';

const { t } = useI18n();

const props = defineProps<{
  slug: string;
  // The viewer's progress: when it moves, other episodes' comments come into reach.
  progressKey: string;
}>();

const emit = defineEmits<{
  'open-episode': [position: { season: number; episode: number }];
}>();

const items = ref<ShowFeedComment[]>([]);
const status = ref<'loading' | 'ready' | 'error'>('loading');
const hasMore = ref(false);
const loadingMore = ref(false);
const revealed = ref(new Set<string>());

// The feed is ranked by likes: the next page starts where the shown ones end.
async function load(offset = 0) {
  if (!offset) status.value = 'loading';
  try {
    const response = await $fetch<{ comments: ShowFeedComment[]; hasMore: boolean }>(
      `/api/shows/${props.slug}/comments`,
      { query: offset ? { offset } : {} },
    );
    items.value = offset ? [...items.value, ...response.comments] : response.comments;
    hasMore.value = response.hasMore;
    status.value = 'ready';
  } catch {
    if (!offset) status.value = 'error';
  }
}

async function loadMore() {
  loadingMore.value = true;
  try {
    await load(items.value.length);
  } finally {
    loadingMore.value = false;
  }
}

function reveal(id: string) {
  revealed.value = new Set([...revealed.value, id]);
}

onMounted(() => load());
watch(() => props.progressKey, () => load());

defineExpose({ reload: () => load() });
</script>
