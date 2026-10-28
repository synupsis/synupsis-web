<template>
  <HoverCardRoot v-model:open="isOpen" :open-delay="140" :close-delay="120">
    <HoverCardTrigger as-child>
      <button
        type="button"
        class="group inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] p-1 pr-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        :aria-label="t('Learn more about {name}', { name })"
        :aria-expanded="isOpen"
        @click="isOpen = !isOpen"
      >
        <span class="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-[10px] font-bold text-primary">
          <img
            v-if="imageSrc"
            :src="imageSrc"
            alt=""
            class="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            @error="imageLoadFailed = true"
          >
          <span v-else aria-hidden="true">{{ initials }}</span>
        </span>
        <span class="truncate text-xs font-medium text-white/85 group-hover:text-white">{{ name }}</span>
      </button>
    </HoverCardTrigger>

    <HoverCardPortal>
      <HoverCardContent
        side="top"
        align="start"
        :side-offset="10"
        class="z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-popover/95 p-4 text-popover-foreground shadow-2xl shadow-black/40 backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
      >
        <div class="flex items-center gap-3">
          <span class="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-primary/15 text-sm font-bold text-primary">
            <img
              v-if="imageSrc"
              :src="imageSrc"
              alt=""
              class="absolute inset-0 h-full w-full object-cover"
              @error="imageLoadFailed = true"
            >
            <span v-else aria-hidden="true">{{ initials }}</span>
          </span>
          <div class="min-w-0">
            <p class="truncate font-semibold text-white">{{ name }}</p>
            <p v-if="profile?.actorName" class="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MicrophoneIcon v-if="profile.isVoice" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span class="truncate">{{ profile.isVoice ? t('Voiced by') : t('Played by') }} {{ profile.actorName }}</span>
            </p>
            <p v-if="profile?.imageKind === 'actor'" class="mt-1 text-[10px] text-amber-200/70">
              {{ t('Character portrait unavailable') }}
            </p>
          </div>
        </div>

        <div v-if="profile?.eventCount || profile?.lastSeen" class="mt-4 grid grid-cols-2 gap-2">
          <div v-if="profile.eventCount" class="rounded-xl bg-white/[0.045] px-3 py-2">
            <p class="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{{ t('Timeline') }}</p>
            <p class="mt-0.5 text-sm font-semibold text-white">
              {{ profile.eventCount > 1 ? t('{count} events', { count: profile.eventCount }) : t('{count} event', { count: profile.eventCount }) }}
            </p>
          </div>
          <div v-if="profile.lastSeen" class="rounded-xl bg-white/[0.045] px-3 py-2">
            <p class="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{{ t('Last seen') }}</p>
            <p class="mt-0.5 text-sm font-semibold text-white">
              S{{ profile.lastSeen.seasonNumber }}E{{ profile.lastSeen.episodeNumber }}
            </p>
          </div>
        </div>

        <div v-if="profile?.arcs.length" class="mt-4">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{{ t('Storylines seen so far') }}</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <span
              v-for="arc in profile.arcs.slice(0, 3)"
              :key="arc"
              class="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] text-primary"
            >
              {{ arc }}
            </span>
          </div>
        </div>

        <div v-if="profile?.keyEvents.length" class="mt-4">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{{ t('Key moments') }}</p>
          <ul class="mt-2 space-y-2">
            <li v-for="event in profile.keyEvents" :key="`${event.seasonNumber}-${event.id}`" class="flex gap-2 text-xs leading-5 text-white/75">
              <span class="mt-0.5 shrink-0 font-semibold text-primary">S{{ event.seasonNumber }}E{{ event.episodeNumber }}</span>
              <span>{{ event.title }}</span>
            </li>
          </ul>
        </div>

        <p v-if="!hasTimelineDetails" class="mt-4 text-xs leading-5 text-muted-foreground">
          {{ t('No further details are available in the episodes shown so far.') }}
        </p>

        <a
          v-if="profile?.sourceUrl"
          :href="profile.sourceUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-4 inline-flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-primary"
        >
          {{ t('Portrait and cast via TVMaze') }}
          <ArrowTopRightOnSquareIcon class="h-3 w-3" aria-hidden="true" />
        </a>
      </HoverCardContent>
    </HoverCardPortal>
  </HoverCardRoot>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowTopRightOnSquareIcon, MicrophoneIcon } from '@heroicons/vue/24/outline';
import {
  HoverCardContent,
  HoverCardPortal,
  HoverCardRoot,
  HoverCardTrigger,
} from 'reka-ui';
import { characterImageUrl } from '~/lib/image-url';
import { nameInitials } from '~/lib/utils';
import type { TimelineCharacterProfile } from '~/types/show-character.types';

const { t } = useI18n();

const props = defineProps<{
  name: string;
  profile?: TimelineCharacterProfile | null;
}>();

const isOpen = ref(false);
const imageLoadFailed = ref(false);

const initials = computed(() => nameInitials(props.name));
const imageSrc = computed(() => (imageLoadFailed.value ? '' : characterImageUrl(props.profile)));
const hasTimelineDetails = computed(() => Boolean(
  props.profile?.eventCount
  || props.profile?.lastSeen
  || props.profile?.arcs.length
  || props.profile?.keyEvents.length,
));

watch(() => props.profile?.imageUrl, () => {
  imageLoadFailed.value = false;
});
</script>
