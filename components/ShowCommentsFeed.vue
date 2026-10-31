<template>
  <!-- Every watched episode's comments in one feed, with the viewer's chosen order. -->
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-2xl font-bold sm:text-3xl">{{ t('Comments') }}</h2>
      <div class="ml-auto flex shrink-0 items-center gap-3">
        <span :id="`${sortId}-label`" class="sr-only">{{ t('Sort by') }}</span>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              type="button"
              :aria-labelledby="`${sortId}-label ${sortId}-value`"
              class="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.025] text-foreground transition-colors hover:border-violet-400/40 hover:bg-violet-500/[0.08] focus-visible:ring-2 focus-visible:ring-violet-400 data-[state=open]:border-violet-400/40 data-[state=open]:bg-violet-500/[0.08] motion-reduce:transition-none"
            >
              <ArrowDownWideNarrowIcon class="h-4 w-4 shrink-0 text-violet-300" aria-hidden="true" />
              <span :id="`${sortId}-value`" class="sr-only">{{ selectedSort.label }}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            :side-offset="8"
            class="w-60 max-w-[calc(100vw-2rem)] rounded-2xl border-white/10 bg-popover/95 p-1.5 shadow-xl shadow-black/30 backdrop-blur-xl"
          >
            <DropdownMenuRadioGroup :model-value="sort" :aria-label="t('Sort by')" class="space-y-1" @update:model-value="selectSort">
              <SortMenuItem
                v-for="option in sortOptions"
                :key="option.value"
                :value="option.value"
                class="group flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground outline-none transition-colors data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-foreground data-[state=checked]:bg-violet-500/15 data-[state=checked]:text-violet-200 motion-reduce:transition-none"
              >
                <component :is="option.icon" class="h-4 w-4 shrink-0 text-muted-foreground group-data-[state=checked]:text-violet-300" aria-hidden="true" />
                <span class="flex-1 font-medium">{{ option.label }}</span>
                <DropdownMenuItemIndicator class="flex h-4 w-4 items-center justify-center">
                  <CheckIcon class="h-4 w-4" aria-hidden="true" />
                </DropdownMenuItemIndicator>
              </SortMenuItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    <p v-if="status === 'loading'" role="status" class="sr-only">{{ t('Loading…') }}</p>
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
      <Button type="button" variant="outline" class="mt-4 rounded-full" @click="reload()">{{ t('Retry') }}</Button>
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
      <p v-if="loadMoreError" role="alert" class="mt-4 text-center text-sm text-muted-foreground">{{ t('Could not load the comments.') }}</p>
      <div v-if="hasMore" class="mt-4 flex justify-center">
        <Button type="button" variant="outline" class="rounded-full" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? t('Loading…') : loadMoreError ? t('Retry') : t('Show more comments') }}
        </Button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ArrowDownWideNarrowIcon, CheckIcon, ClockIcon, EyeOffIcon, HeartIcon, HistoryIcon, ListOrderedIcon, MessagesSquareIcon } from 'lucide-vue-next';
import { DropdownMenuItemIndicator, DropdownMenuRadioItem as SortMenuItem } from 'reka-ui';
import { computed, onMounted, ref, useId, watch } from 'vue';
import { Button } from '~/components/shadcn/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuTrigger } from '~/components/shadcn/dropdown-menu';
import CommentAuthorLine from '~/components/CommentAuthorLine.vue';
import { useShowCommentsFeed } from '~/composables/useShowCommentsFeed';
import type { ShowCommentSort } from '~/types/episode-comment.types';

const { t } = useI18n();

const props = defineProps<{
  slug: string;
  // The viewer's progress: when it moves, other episodes' comments come into reach.
  progressKey: string;
}>();

const emit = defineEmits<{
  'open-episode': [position: { season: number; episode: number }];
}>();

const sortId = useId();
const sort = ref<ShowCommentSort>('most-liked');
const sortOptions = computed(() => [
  { value: 'most-liked', label: t('Most liked'), icon: HeartIcon },
  { value: 'newest', label: t('Newest first'), icon: ClockIcon },
  { value: 'oldest', label: t('Oldest first'), icon: HistoryIcon },
  { value: 'episode', label: t('Episode order'), icon: ListOrderedIcon },
] as const);
const selectedSort = computed(() => sortOptions.value.find(option => option.value === sort.value) ?? sortOptions.value[0]);

function selectSort(value: unknown) {
  const option = sortOptions.value.find(option => option.value === value);
  if (option) sort.value = option.value;
}

const { items, status, hasMore, loadingMore, loadMoreError, reload, loadMore } = useShowCommentsFeed({
  slug: () => props.slug,
  progressKey: () => props.progressKey,
  sort: () => sort.value,
});
const revealed = ref(new Set<string>());

function reveal(id: string) {
  revealed.value = new Set([...revealed.value, id]);
}

onMounted(reload);
watch([() => props.slug, () => props.progressKey], () => { revealed.value = new Set(); }, { flush: 'sync' });

defineExpose({ reload });
</script>
