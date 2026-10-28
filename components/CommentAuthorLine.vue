<template>
  <!-- Who wrote a comment, and when: the avatar, the name and a relative date. -->
  <div class="flex min-w-0 items-center gap-2">
    <Avatar class="shrink-0" :class="small ? 'h-6 w-6' : 'h-8 w-8'">
      <AvatarImage v-if="avatarUrl" :src="avatarUrl" alt="" />
      <AvatarFallback class="bg-white/10 text-[11px] font-semibold">{{ initial }}</AvatarFallback>
    </Avatar>
    <span class="truncate text-sm font-semibold">{{ name || t('A viewer') }}</span>
    <span v-if="isOwn" class="shrink-0 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-semibold text-primary">{{ t('You') }}</span>
    <time class="shrink-0 text-xs text-muted-foreground" :datetime="date" :title="formatAbsoluteDate(date, locale)">
      {{ formatRelativeDate(date, locale, t('just now')) }}
    </time>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/shadcn/avatar';
import { formatAbsoluteDate, formatRelativeDate } from '~/lib/relative-date';

const { t, locale } = useI18n();

const props = defineProps<{
  name: string | null;
  avatarUrl: string | null;
  date: string;
  isOwn?: boolean;
  small?: boolean;
}>();

const initial = computed(() => (props.name?.trim()[0] ?? '?').toLocaleUpperCase());
</script>
