<template>
  <div class="min-h-screen w-full bg-background text-foreground">
    <AppHeader class="border-b border-border" />
    <main class="mx-auto max-w-3xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <div v-if="pending" class="grid min-h-[50vh] place-items-center"><SpinLoader class="h-8 w-8" /></div>
      <div v-else-if="error || !data" class="grid min-h-[50vh] place-items-center text-center">
        <div>
          <h1 class="text-2xl font-bold">{{ notFound ? t('Profile not found') : t('Could not load this profile.') }}</h1>
          <p class="mt-2 text-muted-foreground">{{ notFound ? t('This address leads to no profile.') : t('Please try again in a moment.') }}</p>
          <Button v-if="!notFound" class="mt-5" @click="refresh()">{{ t('Retry') }}</Button>
        </div>
      </div>
      <template v-else>
        <section class="flex flex-wrap items-start gap-5" :aria-label="t('Profile')">
          <Avatar class="size-20 sm:size-24">
            <AvatarImage v-if="data.profile.avatarUrl" :src="data.profile.avatarUrl" alt="" />
            <AvatarFallback class="flex size-full items-center justify-center bg-foreground/10 text-2xl font-semibold">{{ initial }}</AvatarFallback>
          </Avatar>
          <div class="min-w-0 flex-1">
            <h1 class="truncate text-3xl font-bold tracking-tight">{{ data.profile.displayName }}</h1>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ t('Member since {date}', { date: memberSince }) }}
            </p>
            <p v-if="data.profile.bio" class="mt-3 whitespace-pre-line text-sm leading-relaxed">{{ data.profile.bio }}</p>
          </div>
          <Button v-if="data.profile.isOwn" as-child variant="outline" class="h-10 rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-foreground hover:bg-muted">
            <NuxtLink to="/settings">
              <PencilIcon class="mr-2 h-4 w-4" aria-hidden="true" />
              {{ t('Edit profile') }}
            </NuxtLink>
          </Button>
        </section>

        <dl class="mt-10 grid grid-cols-2 gap-y-6 border-t border-border pt-8 sm:grid-cols-4">
          <div v-for="stat in stats" :key="stat.label" class="pr-4">
            <dt class="text-sm text-muted-foreground">{{ stat.label }}</dt>
            <dd class="mt-1 text-3xl font-bold tabular-nums">{{ stat.value }}</dd>
          </div>
        </dl>

        <section class="mt-10 border-t border-border pt-8">
          <Tabs v-model="activeTab" default-value="recaps">
            <TabsList class="h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0">
              <TabsTrigger value="recaps" class="rounded-none border-b-2 border-transparent px-0 pb-3 text-sm font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">{{ t('Recaps') }}</TabsTrigger>
              <TabsTrigger value="activity" class="rounded-none border-b-2 border-transparent px-0 pb-3 text-sm font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">{{ t('Activity') }}</TabsTrigger>
            </TabsList>

            <TabsContent value="recaps" class="mt-8">
              <ul v-if="data.recaps.length" class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6">
                <li v-for="recap in data.recaps" :key="recap.id" class="min-w-0">
                  <button type="button" class="group block w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-4 focus-visible:ring-offset-background" @click="openStory(recap.id)">
                    <div class="relative aspect-video overflow-hidden rounded-xl bg-muted">
                      <img
                        v-if="recap.image && !failedImages.has(recap.id)"
                        :src="proxiedImageUrl(recap.image)"
                        alt=""
                        loading="lazy"
                        decoding="async"
                        class="h-full w-full object-cover transition duration-300 group-hover:scale-105 motion-reduce:transform-none"
                        @error="failedImages.add(recap.id)"
                      />
                      <div v-else class="grid h-full place-items-center text-muted-foreground"><Tv class="size-8 opacity-50" aria-hidden="true" /></div>
                      <span class="absolute right-2 top-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase">{{ recap.locale }}</span>
                    </div>
                    <h3 :title="recap.showName" class="mt-3 truncate text-sm font-semibold leading-snug decoration-1 underline-offset-4 group-hover:underline sm:text-base">{{ recap.showName }}</h3>
                  </button>
                  <p class="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground sm:text-sm">
                    <NuxtLink :to="recap.showPath" class="truncate hover:text-foreground hover:underline">{{ t('Season {number}', { number: recap.seasonNumber }) }}</NuxtLink>
                    <span class="flex shrink-0 items-center gap-1 tabular-nums">
                      <EyeIcon class="h-3.5 w-3.5" aria-hidden="true" />
                      {{ recap.views === 1 ? t('1 view') : t('{count} views', { count: recap.views }) }}
                    </span>
                  </p>
                </li>
              </ul>
              <p v-else class="rounded-2xl border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
                {{ data.profile.isOwn ? t('Unlock a season’s recap on a show page: it will show here, with your name.') : t('No recap unlocked yet.') }}
              </p>
            </TabsContent>

            <TabsContent value="activity" class="mt-8">
              <div v-if="activityPending || activityStatus === 'idle'" class="grid h-24 place-items-center"><SpinLoader class="h-6 w-6" /></div>
              <div v-else-if="activityError" class="text-center text-sm text-muted-foreground" role="status">
                <p>{{ t('Could not load this activity.') }}</p>
                <button type="button" class="mt-4 rounded-lg border border-border px-4 py-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground" @click="refreshActivity()">{{ t('Try again') }}</button>
              </div>
              <ul v-else-if="activity?.items.length" class="divide-y divide-border">
                <li v-for="item in activity.items" :key="`${item.kind}-${item.id}`" class="py-4">
                  <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                    <p class="min-w-0">
                      <span class="text-muted-foreground">{{ activityLabel(item) }}</span>
                      {{ ' ' }}
                      <NuxtLink :to="item.showPath" class="font-medium underline-offset-4 hover:underline">{{ item.showName }}</NuxtLink>
                      <span class="ml-1.5 text-muted-foreground tabular-nums">{{ item.kind === 'comment' ? episodeCode(item.season, item.episode) : t('season {number}', { number: item.seasonNumber }) }}</span>
                    </p>
                    <time class="shrink-0 text-xs text-muted-foreground" :datetime="item.createdAt" :title="formatAbsoluteDate(item.createdAt, locale)">
                      {{ formatRelativeDate(item.createdAt, locale, t('just now')) }}
                    </time>
                  </div>
                  <template v-if="item.kind === 'comment'">
                    <p v-if="!item.body" class="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <LockIcon class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {{ t('Mark this episode as watched to read this comment.') }}
                    </p>
                    <p v-else-if="item.isSpoiler && !revealed.has(item.id)" class="mt-2 text-sm text-muted-foreground">
                      {{ t('This comment may contain spoilers.') }}
                      <button type="button" class="ml-1 font-medium text-foreground underline-offset-4 hover:underline" @click="revealed.add(item.id)">{{ t('Show') }}</button>
                    </p>
                    <p v-else class="mt-2 whitespace-pre-line break-words text-sm leading-relaxed">{{ item.body }}</p>
                  </template>
                  <div class="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span v-if="item.kind === 'suggestion' && item.status === 'accepted'" class="rounded-full bg-foreground/10 px-2 py-0.5 font-medium text-foreground">{{ t('Accepted') }}</span>
                    <span v-if="item.likeCount" class="flex items-center gap-1 tabular-nums">
                      <HeartIcon class="h-3.5 w-3.5" aria-hidden="true" />
                      {{ item.likeCount }}
                    </span>
                    <button v-if="item.kind === 'suggestion'" type="button" class="underline-offset-4 hover:text-foreground hover:underline" @click="openStory(item.recapId)">{{ t('Open the recap') }}</button>
                  </div>
                </li>
              </ul>
              <p v-else class="rounded-2xl border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">{{ t('No activity yet.') }}</p>
            </TabsContent>
          </Tabs>
        </section>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { EyeIcon, HeartIcon, LockIcon, PencilIcon, Tv } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/shadcn/avatar';
import { Button } from '~/components/shadcn/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/shadcn/tabs';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import { useStoryViewer } from '~/composables/useStoryViewer';
import { proxiedImageUrl } from '~/lib/image-url';
import { formatAbsoluteDate, formatRelativeDate } from '~/lib/relative-date';
import type { PublicProfileActivity, PublicProfilePayload } from '~/types/public-profile.types';

const { t, locale } = useI18n();
const route = useRoute();
const handle = computed(() => String(route.params.handle ?? '').toLowerCase());
const { openStory } = useStoryViewer();

const { data, pending, error, refresh } = await useFetch<PublicProfilePayload>(() => `/api/users/${encodeURIComponent(handle.value)}`);
const notFound = computed(() => error.value?.statusCode === 404);
// A missing page answers 404 to crawlers too, not only in its text.
if (notFound.value) {
  const event = useRequestEvent();
  if (event) setResponseStatus(event, 404);
}

// Read with the visitor's session, so only after hydration and only when opened.
const activeTab = ref('recaps');
const {
  data: activity,
  pending: activityPending,
  error: activityError,
  status: activityStatus,
  execute: loadActivity,
  refresh: refreshActivity,
  clear: clearActivity,
} = useFetch<{ items: PublicProfileActivity[] }>(() => `/api/users/${encodeURIComponent(handle.value)}/activity`, {
  server: false,
  immediate: false,
  watch: false,
});
watch(activeTab, tab => { if (tab === 'activity' && activityStatus.value === 'idle') void loadActivity(); });
watch(handle, () => { activeTab.value = 'recaps'; clearActivity(); });

const failedImages = reactive(new Set<string>());
const revealed = reactive(new Set<string>());

const initial = computed(() => (data.value?.profile.displayName.trim()[0] ?? '?').toLocaleUpperCase());
const memberSince = computed(() => data.value
  ? new Date(data.value.profile.memberSince).toLocaleDateString(locale.value, { month: 'long', year: 'numeric' })
  : '');
const stats = computed(() => data.value ? [
  { label: t('Recaps unlocked'), value: data.value.stats.recaps },
  { label: t('Recap views'), value: data.value.stats.views },
  { label: t('Comments'), value: data.value.stats.comments },
  { label: t('Accepted suggestions'), value: data.value.stats.acceptedSuggestions },
] : []);

function episodeCode(season: number, episode: number) {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

function activityLabel(item: PublicProfileActivity) {
  if (item.kind === 'comment') return item.isReply ? t('Replied on') : t('Commented on');
  if (item.suggestionKind === 'text') return t('Suggested a text correction on');
  if (item.suggestionKind === 'add') return t('Suggested a new slide on');
  return t('Suggested a change on');
}

useHead(() => ({
  title: data.value ? t('{name} — Synupsis', { name: data.value.profile.displayName }) : t('Profile — Synupsis'),
}));
</script>
