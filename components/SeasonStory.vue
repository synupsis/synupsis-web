<template>
  <article class="group relative w-24 shrink-0 text-center">
    <div class="relative mx-auto w-fit">
      <button
        type="button"
        class="block rounded-full outline-none transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background disabled:cursor-default"
        :class="{ 'active:scale-95': !primaryDisabled }"
        :disabled="primaryDisabled"
        :aria-label="actionLabel"
        @click="handlePrimaryAction"
      >
        <span
          class="block h-[88px] w-[88px] rounded-full p-[3px] transition duration-200"
          :class="storyRingClass"
        >
          <span class="block h-full w-full rounded-full bg-background p-[3px]">
            <span class="relative block h-full w-full overflow-hidden rounded-full bg-muted">
              <CachedImage
                v-if="season.image"
                :src="season.image"
                :alt="`Affiche de la saison ${season.number}`"
                class="h-full w-full object-cover transition duration-300"
                :class="{ 'group-hover:scale-105': !primaryDisabled, 'grayscale-[35%]': spoilerLocked }"
              />
              <span v-else class="block h-full w-full bg-gradient-to-br from-white/10 via-primary/10 to-black" />

              <span
                v-if="spoilerLocked || isGenerating"
                class="absolute inset-0 grid place-items-center bg-black/60 text-white"
              >
                <LockClosedIcon v-if="spoilerLocked" class="h-6 w-6" />
                <span v-else class="flex flex-col items-center gap-1 text-[10px] font-bold tabular-nums">
                  <SpinLoader class="h-5 w-5" />
                  {{ generationProgress }}%
                </span>
              </span>
              <span
                v-else-if="isPublished"
                class="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100 group-focus-within:bg-black/35 group-focus-within:opacity-100"
              >
                <PlayIcon class="h-7 w-7 drop-shadow" />
              </span>
              <span
                v-else-if="!isDraft"
                class="absolute inset-0 grid place-items-center bg-black/30 text-white/90 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <SparklesIcon class="h-6 w-6" />
              </span>
            </span>
          </span>
        </span>
      </button>

      <span
        class="absolute bottom-0 right-0 grid h-6 w-6 place-items-center rounded-full border-[3px] border-background shadow"
        :class="statusIconClass"
        aria-hidden="true"
      >
        <LockClosedIcon v-if="spoilerLocked" class="h-3 w-3" />
        <SpinLoader v-else-if="isGenerating" class="h-3 w-3" />
        <PlayIcon v-else-if="isPublished" class="h-3 w-3" />
        <PencilIcon v-else-if="isDraft" class="h-3 w-3" />
        <SparklesIcon v-else class="h-3 w-3" />
      </span>

      <ClientOnly>
        <button
          v-if="user && isAdmin && !spoilerLocked && !isGenerating"
          type="button"
          class="absolute -right-1 top-0 grid h-7 w-7 place-items-center rounded-full border border-white/15 bg-background/95 text-white shadow-lg transition hover:border-primary/50 hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          :aria-label="adminActionLabel"
          @click.stop="handleAdminAction"
        >
          <PencilIcon class="h-3.5 w-3.5" />
        </button>
      </ClientOnly>
    </div>

    <h3 class="mt-2 truncate text-xs font-semibold text-white">
      Saison {{ season.number }}
    </h3>
    <p class="mt-0.5 truncate text-[11px] leading-4" :class="statusTextClass">
      {{ statusLabel }}
    </p>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { LockClosedIcon, PencilIcon, SparklesIcon } from '@heroicons/vue/24/outline';
import { PlayIcon } from '@heroicons/vue/24/solid';
import CachedImage from '~/components/CachedImage.vue';
import SpinLoader from '~/components/ui/SpinLoader.vue';

const props = withDefaults(defineProps<{
  season: any;
  isAdmin: boolean;
  isGenerating: boolean;
  generationProgress?: number;
  isLatest: boolean;
  spoilerLocked?: boolean;
}>(), {
  generationProgress: 0,
  spoilerLocked: false,
});

const emit = defineEmits<{
  view: [recapId: string];
  edit: [recapId: string];
  create: [seasonId: string];
  generate: [seasonId: string];
}>();

const user = useSupabaseUser();

const publishedRecap = computed(() => (props.season.recap || []).find((recap: any) => recap.status === 'published'));
const draftRecap = computed(() => (props.season.recap || []).find((recap: any) => recap.status === 'draft'));
const isPublished = computed(() => Boolean(publishedRecap.value));
const isDraft = computed(() => Boolean(draftRecap.value));
const primaryDisabled = computed(() => props.spoilerLocked || props.isGenerating || (isDraft.value && !(user.value && props.isAdmin)));

const statusLabel = computed(() => {
  if (props.spoilerLocked) return 'Verrouillé';
  if (props.isGenerating) return `Préparation · ${props.generationProgress}%`;
  if (isPublished.value) return props.isLatest ? 'Nouveau' : 'Disponible';
  if (isDraft.value) return 'Brouillon';
  return 'À créer';
});

const statusTextClass = computed(() => {
  if (props.spoilerLocked) return 'text-muted-foreground';
  if (props.isGenerating || isDraft.value) return 'text-amber-300';
  if (isPublished.value) return 'text-primary';
  return 'text-muted-foreground';
});

const storyRingClass = computed(() => {
  if (props.spoilerLocked) return 'bg-white/10 opacity-70';
  if (props.isGenerating) return 'animate-pulse bg-gradient-to-br from-amber-300 via-orange-500 to-primary';
  if (isPublished.value) return 'bg-gradient-to-br from-fuchsia-500 via-primary to-cyan-400 shadow-[0_0_24px_-10px_hsl(var(--primary))] group-hover:shadow-[0_0_30px_-8px_hsl(var(--primary))]';
  if (isDraft.value) return 'bg-gradient-to-br from-amber-300 to-orange-600';
  return 'bg-white/15 group-hover:bg-white/25';
});

const statusIconClass = computed(() => {
  if (props.spoilerLocked) return 'bg-zinc-700 text-zinc-300';
  if (props.isGenerating) return 'bg-amber-500 text-black';
  if (isPublished.value) return 'bg-primary text-primary-foreground';
  if (isDraft.value) return 'bg-amber-500 text-black';
  return 'bg-zinc-700 text-zinc-200';
});

const actionLabel = computed(() => {
  if (props.spoilerLocked) return `Le récap de la saison ${props.season.number} est verrouillé`;
  if (props.isGenerating) return `Préparation du récap de la saison ${props.season.number}, ${props.generationProgress}%`;
  if (isPublished.value) return `Voir le récap de la saison ${props.season.number}`;
  if (isDraft.value) return `Modifier le brouillon de la saison ${props.season.number}`;
  return `Créer le récap de la saison ${props.season.number}`;
});

const adminActionLabel = computed(() => (
  isPublished.value || isDraft.value
    ? `Modifier le récap de la saison ${props.season.number}`
    : `Créer manuellement le récap de la saison ${props.season.number}`
));

function handlePrimaryAction() {
  if (primaryDisabled.value) return;
  if (publishedRecap.value) {
    emit('view', publishedRecap.value.id);
    return;
  }
  if (draftRecap.value) {
    emit('edit', draftRecap.value.id);
    return;
  }
  emit('generate', props.season.id);
}

function handleAdminAction() {
  const recap = publishedRecap.value || draftRecap.value;
  if (recap) {
    emit('edit', recap.id);
    return;
  }
  emit('create', props.season.id);
}
</script>
