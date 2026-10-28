<template>
  <NuxtLink
    :to="`/shows/${show.slug}-${show.traktId}`"
    :class="[
      'group block rounded-2xl text-left outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-4 focus-visible:ring-offset-background',
      featured ? 'flex items-center gap-5 border border-violet-400/20 bg-violet-400/5 p-4 hover:border-violet-400/50 sm:gap-7 sm:p-6' : '',
    ]"
  >
    <div :class="['relative shrink-0 overflow-hidden rounded-xl bg-muted', featured ? 'w-24 sm:w-32' : 'w-full']">
      <div class="aspect-[2/3]">
        <img
          v-if="show.image && !imageFailed"
          :src="imageUrl"
          alt=""
          :loading="featured ? 'eager' : 'lazy'"
          decoding="async"
          class="h-full w-full object-cover transition duration-300 group-hover:scale-105 motion-reduce:transition-none"
          @error="imageFailed = true"
        />
        <div v-else class="flex h-full flex-col items-center justify-center gap-3 p-3 text-center text-muted-foreground">
          <Tv class="size-8 opacity-50" aria-hidden="true" />
          <span class="text-xs leading-relaxed">{{ t('Poster unavailable') }}</span>
        </div>
      </div>
      <span v-if="!featured && show.rating" class="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
        <Star class="size-3 fill-amber-300 text-amber-300" aria-hidden="true" />
        <span class="sr-only">{{ t('Rating:') }} </span>{{ show.rating.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }}<span class="sr-only"> {{ t('out of 10') }}</span>
      </span>
    </div>
    <div :class="featured ? 'min-w-0 flex-1' : 'mt-3'">
      <p v-if="featured" class="mb-2 text-xs font-medium text-violet-500 dark:text-violet-300">{{ t('Top result') }}</p>
      <h3 :class="['font-semibold leading-snug transition group-hover:text-violet-500 dark:group-hover:text-violet-300', featured ? 'text-xl sm:text-3xl' : 'text-sm sm:text-base']">{{ show.name }}</h3>
      <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:text-sm">
        <span v-if="show.year">{{ show.year }}</span>
        <span v-if="featured && show.genres?.length" class="capitalize">{{ show.genres.slice(0, 2).join(' · ').replaceAll('-', ' ') }}</span>
        <span v-if="featured && show.rating" class="flex items-center gap-1">
          <Star class="size-3.5 fill-amber-300 text-amber-300" aria-hidden="true" />
          <span class="sr-only">{{ t('Rating:') }} </span>{{ show.rating.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }}<span class="sr-only"> {{ t('out of 10') }}</span>
        </span>
      </div>
      <p v-if="featured && show.overview" class="mt-3 hidden max-w-2xl text-sm leading-relaxed text-muted-foreground sm:line-clamp-2">{{ show.overview }}</p>
      <span v-if="featured" class="mt-4 inline-flex items-center gap-2 text-xs font-medium sm:text-sm">{{ t('Explore seasons') }} <ArrowUpRight class="size-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" /></span>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
const { t, locale } = useI18n();
import { ArrowUpRight, Star, Tv } from 'lucide-vue-next';
import { proxiedImageUrl } from '~/lib/image-url';
import type { TraktShowCard } from '~/types/trakt.types';

const props = withDefaults(defineProps<{ show: TraktShowCard; featured?: boolean }>(), { featured: false });
const imageFailed = ref(false);
const imageUrl = computed(() => proxiedImageUrl(props.show.image));
watch(() => props.show.image, () => { imageFailed.value = false; });
</script>
