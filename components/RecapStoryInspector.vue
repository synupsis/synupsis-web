<template>
  <aside class="w-80 shrink-0 overflow-y-auto border-l border-border bg-background p-5">
    <div class="space-y-1">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-xl font-semibold tracking-tight">{{ t('Content') }}</h2>
        <Badge variant="secondary">{{ kindLabel }}</Badge>
      </div>
      <p class="text-xs leading-relaxed text-muted-foreground">
        {{ t('This is the text displayed in the public player.') }}
      </p>
    </div>

    <div class="mt-6 space-y-5">
      <template v-if="content.kind === 'cover'">
        <StoryField
          :label="t('Title')"
          :model-value="content.title"
          :limit="90"
          @update:model-value="updateCover('title', $event)"
        />
        <StoryField
          :label="t('Subtitle')"
          :model-value="content.subtitle"
          :limit="140"
          @update:model-value="updateCover('subtitle', $event)"
        />
        <StoryField
          :label="t('Introduction')"
          :model-value="content.logline"
          :limit="360"
          multiline
          :rows="6"
          @update:model-value="updateCover('logline', $event)"
        />
      </template>

      <template v-else-if="content.kind === 'episode'">
        <StoryField
          :label="t('Episode title')"
          :model-value="content.headline"
          :limit="90"
          @update:model-value="updateEpisodeHeadline($event)"
        />
        <StoryField
          v-for="(moment, index) in content.moments"
          :key="index"
          :label="t('Moment {number}', { number: index + 1 })"
          :model-value="moment"
          :limit="240"
          multiline
          :rows="4"
          @update:model-value="updateEpisodeMoment(index, $event)"
        />
      </template>

      <template v-else-if="content.kind === 'beat'">
        <StoryField
          :label="t('Headline')"
          :model-value="content.headline"
          :limit="90"
          @update:model-value="updateBeat('headline', $event)"
        />
        <StoryField
          :label="t('Narration')"
          :model-value="content.narration"
          :limit="520"
          multiline
          :rows="12"
          @update:model-value="updateBeat('narration', $event)"
        />
        <StoryField
          :label="t('Tag')"
          :model-value="content.tag"
          :limit="60"
          @update:model-value="updateBeat('tag', $event)"
        />

        <div class="space-y-2">
          <label for="story-episodes" class="text-sm font-medium">{{ t('Related episodes') }}</label>
          <Input
            id="story-episodes"
            :model-value="episodeNumbersText"
            inputmode="numeric"
            placeholder="1, 2, 3"
            @update:model-value="updateEpisodeNumbers(String($event))"
          />
          <p class="text-xs text-muted-foreground">{{ t('Separate numbers with commas.') }}</p>
        </div>
      </template>
    </div>

    <div class="mt-7 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
      {{ t('Source references are preserved. After editing the text, automatic verification will need to be renewed.') }}
    </div>
  </aside>
</template>

<script setup lang="ts">
const { t } = useI18n();
import { computed, defineComponent, h } from 'vue';
import { Badge } from '~/components/shadcn/badge';
import { Input } from '~/components/shadcn/input';
import { Textarea } from '~/components/shadcn/textarea';
import type {
  RecapBeatSlideContent,
  RecapCoverSlideContent,
  RecapEpisodeSlideContent,
  RecapStorySlideContent,
} from '~/types/recap-story.types';

const props = defineProps<{
  content: RecapStorySlideContent;
}>();

const emit = defineEmits<{
  update: [content: RecapStorySlideContent];
}>();

const StoryField = defineComponent({
  name: 'StoryField',
  props: {
    label: { type: String, required: true },
    modelValue: { type: String, required: true },
    limit: { type: Number, required: true },
    multiline: { type: Boolean, default: false },
    rows: { type: Number, default: 4 },
  },
  emits: ['update:modelValue'],
  setup(fieldProps, { emit: fieldEmit }) {
    return () => h('div', { class: 'space-y-2' }, [
      h('div', { class: 'flex items-center justify-between gap-3' }, [
        h('label', { class: 'text-sm font-medium' }, fieldProps.label),
        h('span', {
          class: fieldProps.modelValue.length > fieldProps.limit
            ? 'text-xs tabular-nums text-destructive'
            : 'text-xs tabular-nums text-muted-foreground',
        }, `${fieldProps.modelValue.length}/${fieldProps.limit}`),
      ]),
      h(fieldProps.multiline ? Textarea : Input, {
        modelValue: fieldProps.modelValue,
        maxlength: fieldProps.limit,
        rows: fieldProps.multiline ? fieldProps.rows : undefined,
        class: fieldProps.multiline ? 'resize-y leading-relaxed' : undefined,
        'onUpdate:modelValue': (value: string | number) => fieldEmit('update:modelValue', String(value)),
      }),
    ]);
  },
});

const episodeNumbersText = computed(() => (
  props.content.kind === 'beat' ? props.content.episodeNumbers.join(', ') : ''
));
const kindLabel = computed(() => {
  if (props.content.kind === 'cover') return t("Cover");
  if (props.content.kind === 'episode') {
    const { episodeNumber, part, partCount } = props.content;
    return partCount && partCount > 1 ? t("Episode {number} · {part}/{count}", { number: episodeNumber, part: part ?? 1, count: partCount }) : t("Episode {number}", { number: episodeNumber });
  }
  return t("Key moment");
});

function updateEpisodeHeadline(value: string | number) {
  if (props.content.kind !== 'episode') return;
  emit('update', { ...props.content, headline: String(value) });
}

function updateEpisodeMoment(index: number, value: string | number) {
  if (props.content.kind !== 'episode') return;
  const moments = [...props.content.moments];
  moments[index] = String(value);
  emit('update', { ...props.content, moments } satisfies RecapEpisodeSlideContent);
}

function updateCover(key: keyof RecapStoryCoverEditable, value: string | number) {
  if (props.content.kind !== 'cover') return;
  emit('update', { ...props.content, [key]: String(value) } as RecapCoverSlideContent);
}

function updateBeat(key: keyof RecapStoryBeatEditable, value: string | number) {
  if (props.content.kind !== 'beat') return;
  emit('update', { ...props.content, [key]: String(value) } as RecapBeatSlideContent);
}

function updateEpisodeNumbers(value: string) {
  if (props.content.kind !== 'beat') return;
  const numbers = [...new Set(
    value
      .split(/[,;\s]+/)
      .map(Number)
      .filter(number => Number.isInteger(number) && number > 0),
  )].sort((a, b) => a - b);
  emit('update', { ...props.content, episodeNumbers: numbers });
}

type RecapStoryCoverEditable = Pick<RecapCoverSlideContent, 'title' | 'subtitle' | 'logline'>;
type RecapStoryBeatEditable = Pick<RecapBeatSlideContent, 'headline' | 'narration' | 'tag'>;
</script>
