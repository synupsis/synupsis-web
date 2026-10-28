<template>
  <div class="flex flex-col gap-5">
    <!-- Correcting a text: the text as it is, and the viewer's version. -->
    <form v-if="mode === 'text'" class="flex flex-col gap-4" @submit.prevent="send">
      <p class="line-clamp-3 text-[15px] leading-snug text-white/60">“{{ currentText }}”</p>
      <div>
        <label :for="`${id}-proposed`" class="sr-only">{{ t('Your version') }}</label>
        <Textarea
          :id="`${id}-proposed`"
          ref="proposedInput"
          v-model="proposed"
          required
          :maxlength="3000"
          rows="3"
          class="rounded-2xl border-white/10 bg-white/[0.04] text-[15px] leading-snug focus-visible:ring-1"
        />
      </div>
      <div v-if="showReason">
        <label :for="`${id}-reason`" class="sr-only">{{ t('Why?') }}</label>
        <Textarea
          :id="`${id}-reason`"
          v-model="message"
          :maxlength="2000"
          rows="2"
          class="rounded-2xl border-white/10 bg-white/[0.04] focus-visible:ring-1"
          :placeholder="t('What is wrong with the current text… (optional)')"
        />
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="!showReason"
          type="button"
          class="text-sm text-white/50 transition-colors hover:text-white"
          @click="showReason = true"
        >
          {{ t('Add a reason') }}
        </button>
        <button type="button" class="ml-auto px-3 text-sm text-white/50 transition-colors hover:text-white" @click="reset">{{ t('Cancel') }}</button>
        <Button type="submit" class="rounded-full px-5" :disabled="submitting || !proposed.trim() || proposed.trim() === currentText?.trim()">
          {{ submitting ? t('Sending…') : t('Suggest my version') }}
        </Button>
      </div>
    </form>

    <!-- A change no text correction can make, or a new slide: in the viewer's words. -->
    <form v-else-if="mode === 'change' || mode === 'add'" class="flex flex-col gap-4" @submit.prevent="send">
      <p class="text-[15px] leading-snug text-white/60">
        {{ mode === 'add' ? t('What should the new slide tell? It would come after slide {number}.', { number: slideOrder }) : t('What should change on this slide?') }}
      </p>
      <div>
        <label :for="`${id}-message`" class="sr-only">{{ mode === 'add' ? t('What should the new slide tell?') : t('What should change?') }}</label>
        <Textarea
          :id="`${id}-message`"
          ref="messageInput"
          v-model="message"
          required
          minlength="10"
          maxlength="2000"
          rows="4"
          class="rounded-2xl border-white/10 bg-white/[0.04] text-[15px] leading-snug focus-visible:ring-1"
          :placeholder="mode === 'add' ? t('A missing scene, a character, a detail…') : t('A wrong image, a missing scene…')"
        />
      </div>
      <div class="flex items-center justify-end gap-2">
        <button type="button" class="px-3 text-sm text-white/50 transition-colors hover:text-white" @click="reset">{{ t('Cancel') }}</button>
        <Button type="submit" class="rounded-full px-5" :disabled="submitting || message.trim().length < 10">
          {{ submitting ? t('Sending…') : t('Send') }}
        </Button>
      </div>
    </form>

    <!-- Opened from a text's chip: the text, then the versions proposed for it. -->
    <div v-else-if="listPath && listText !== null">
      <p class="text-[13px] text-white/50">
        {{ listed.length > 1 ? t('{count} proposed versions', { count: listed.length }) : t('{count} proposed version', { count: listed.length }) }}
      </p>
      <p class="mt-1.5 line-clamp-3 text-[15px] leading-snug text-white/60">“{{ listText }}”</p>
    </div>

    <section v-if="listed.length" :aria-label="listTitle">
      <h3 v-if="mode !== 'list' || !listPath" class="text-[13px] text-white/50">
        {{ listTitle }} · {{ listed.length }}
      </h3>
      <ul class="divide-y divide-white/[0.08]">
        <li v-for="suggestion in listed" :key="suggestion.id">
          <RecapSuggestionItem :suggestion="suggestion" @like="store.toggleLike(suggestion)" />
        </li>
      </ul>
    </section>
    <p v-else-if="mode === 'list' && store.loaded.value" class="text-[15px] text-white/50">{{ t('No suggestions on this slide yet.') }}</p>

    <template v-if="mode === 'list'">
      <Button v-if="listPath" type="button" class="h-11 w-full rounded-full text-[15px]" @click="emit('update:selectedPath', listPath)">
        <PencilIcon class="mr-2 h-4 w-4" aria-hidden="true" />
        {{ t('Suggest my version') }}
      </Button>
      <div class="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <button v-if="listPath" type="button" class="text-white/50 transition-colors hover:text-white" @click="emit('update:listPath', null)">
          {{ t('All suggestions for this slide') }}
        </button>
        <template v-else>
          <button type="button" class="inline-flex items-center gap-1.5 text-white/50 transition-colors hover:text-white" @click="startForm('change')">
            <PlusIcon class="h-4 w-4" aria-hidden="true" />
            {{ t('Describe another change') }}
          </button>
          <button type="button" class="inline-flex items-center gap-1.5 text-white/50 transition-colors hover:text-white" @click="startForm('add')">
            <PlusIcon class="h-4 w-4" aria-hidden="true" />
            {{ t('Suggest a slide after this one') }}
          </button>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { PencilIcon, PlusIcon } from 'lucide-vue-next';
import { computed, nextTick, ref, useId, watch } from 'vue';
import { Button } from '~/components/shadcn/button';
import { Textarea } from '~/components/shadcn/textarea';
import RecapSuggestionItem from '~/components/RecapSuggestionItem.vue';
import type { RecapSuggestionStore } from '~/composables/useRecapSuggestions';
import type { RecapStoryPayload } from '~/composables/useStoryViewer';
import { editableSlideText } from '~/lib/recap-slide-text';

type Mode = 'list' | 'text' | 'change' | 'add';

const { t } = useI18n();
const id = useId();

const props = defineProps<{
  store: RecapSuggestionStore;
  slide: RecapStoryPayload['slides'][number];
  slideOrder: number;
  // The text picked on the slide: its correction form opens.
  selectedPath: string | null;
  // The text whose chip was opened: only its suggestions are listed.
  listPath?: string | null;
  initialMode?: 'change' | 'add' | null;
}>();

const emit = defineEmits<{
  'update:selectedPath': [path: string | null];
  'update:listPath': [path: string | null];
  sent: [];
}>();

const mode = ref<Mode>(props.initialMode ?? 'list');
const proposed = ref('');
const message = ref('');
const submitting = ref(false);
// The reason for a correction is optional: its field shows on demand.
const showReason = ref(false);
const proposedInput = ref<InstanceType<typeof Textarea> | null>(null);
const messageInput = ref<InstanceType<typeof Textarea> | null>(null);

const listText = computed(() => (props.listPath ? editableSlideText(props.slide.content, props.listPath) : null));
const currentText = computed(() => (props.selectedPath ? editableSlideText(props.slide.content, props.selectedPath) : null));

watch(() => props.selectedPath, (path) => {
  if (path && currentText.value !== null) {
    mode.value = 'text';
    proposed.value = currentText.value;
    message.value = '';
    showReason.value = false;
    focus(proposedInput);
  } else if (mode.value === 'text') {
    mode.value = 'list';
  }
}, { immediate: true });

// A chip opened on the slide: its list replaces whatever form was open.
watch(() => props.listPath, (path) => {
  if (path) mode.value = 'list';
});

function focus(input: typeof proposedInput) {
  void nextTick(() => (input.value?.$el as HTMLTextAreaElement | undefined)?.focus());
}

function startForm(kind: 'change' | 'add') {
  emit('update:selectedPath', null);
  mode.value = kind;
  message.value = '';
  focus(messageInput);
}

function reset() {
  emit('update:selectedPath', null);
  emit('update:listPath', null);
  mode.value = 'list';
  proposed.value = '';
  message.value = '';
}

const slideSuggestions = computed(() => props.store.forSlide(props.slideOrder));

// While correcting a text: what others already proposed for it, to like instead of repeating.
// From a chip, that text's suggestions only.
const listed = computed(() => {
  if (mode.value === 'text') return slideSuggestions.value.filter(suggestion => suggestion.fieldPath === props.selectedPath);
  if (mode.value === 'list' && props.listPath) return slideSuggestions.value.filter(suggestion => suggestion.fieldPath === props.listPath);
  return slideSuggestions.value;
});
const listTitle = computed(() => {
  if (mode.value === 'text') return t('Already proposed');
  if (mode.value === 'list' && props.listPath) return t('Suggestions for this text');
  return t('Suggestions');
});

async function send() {
  submitting.value = true;
  try {
    const sent = await props.store.submit(mode.value === 'text'
      ? {
          kind: 'text',
          slideOrder: props.slideOrder,
          fieldPath: props.selectedPath ?? '',
          currentValue: currentText.value ?? '',
          proposedValue: proposed.value,
          message: message.value,
        }
      : { kind: mode.value as 'change' | 'add', slideOrder: props.slideOrder, message: message.value });
    if (sent) {
      reset();
      emit('sent');
    }
  } finally {
    submitting.value = false;
  }
}
</script>
