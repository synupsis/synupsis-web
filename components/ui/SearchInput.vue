<template>
  <form
    class="group flex min-h-16 w-full items-center gap-3 rounded-2xl border border-border bg-background/90 p-2 pl-5 shadow-lg shadow-black/5 transition focus-within:border-violet-400/70 focus-within:ring-4 focus-within:ring-violet-400/10"
    role="search"
    :aria-label="t('Find a TV show')"
    @submit.prevent="submit"
  >
    <Search class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    <input
      :id="inputId"
      ref="inputRef"
      v-model="query"
      :aria-label="t('Search TV shows')"
      :aria-describedby="describedBy"
      :aria-controls="controls"
      :placeholder="placeholders[0] || t('Search for a TV show…')"
      class="min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 sm:text-lg"
      type="search"
      name="q"
      autocomplete="off"
      autocapitalize="off"
      :spellcheck="false"
      maxlength="100"
      enterkeyhint="search"
      @keydown.esc.prevent="clear"
      @keydown.down="browse"
    />
    <button
      v-if="query"
      type="button"
      :aria-label="t('Clear search')"
      class="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      @click="clear"
    >
      <X class="size-4" aria-hidden="true" />
    </button>
    <button
      :disabled="query.trim().length < 2"
      :aria-label="t('Search shows')"
      class="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 font-medium text-white transition hover:bg-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
      type="submit"
    >
      <LoaderCircle v-if="loading" class="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <ArrowRight v-else class="size-5" aria-hidden="true" />
      <span class="hidden sm:inline">{{ t('Search') }}</span>
    </button>
  </form>
</template>

<script lang="ts" setup>
const { t } = useI18n();
import { ArrowRight, LoaderCircle, Search, X } from 'lucide-vue-next';

withDefaults(defineProps<{
  placeholders?: string[];
  loading?: boolean;
  describedBy?: string;
  controls?: string;
}>(), {
  placeholders: () => [],
  loading: false,
  describedBy: undefined,
  controls: undefined,
});

const query = defineModel<string>({ default: '' });
const emit = defineEmits<{ submit: [value: string]; browse: [] }>();
const inputId = useId();
const inputRef = ref<HTMLInputElement | null>(null);

function focus() {
  inputRef.value?.focus();
}

function clear() {
  query.value = '';
  focus();
}

function submit() {
  if (query.value.trim().length >= 2) emit('submit', query.value);
}

function browse(event: KeyboardEvent) {
  if (event.isComposing) return;
  event.preventDefault();
  emit('browse');
}

defineExpose({ focus });
</script>

<style scoped>
input::-webkit-search-cancel-button,
input::-webkit-search-decoration {
  -webkit-appearance: none;
}
</style>
