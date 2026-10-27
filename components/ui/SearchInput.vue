<template>
  <form
    class="relative mx-auto h-12 w-full max-w-xl overflow-hidden rounded-full bg-white shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),_0px_1px_0px_0px_rgba(25,28,33,0.02),_0px_0px_0px_1px_rgba(25,28,33,0.08)] transition duration-200 dark:bg-zinc-800"
    role="search"
    @submit.prevent="emit('submit', query)"
  >
    <input
      ref="inputRef"
      v-model="query"
      :aria-label="placeholders[currentPlaceholder] ?? 'Search'"
      class="relative z-10 size-full rounded-full border-none bg-transparent pl-4 pr-20 text-sm text-black focus:outline-none focus:ring-0 sm:pl-10 sm:text-base dark:text-white"
      type="text"
    />

    <button
      :disabled="loading || !query"
      aria-label="Search"
      class="absolute right-2 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black transition duration-200 disabled:bg-gray-100 dark:bg-zinc-900 dark:disabled:bg-zinc-700"
      type="submit"
    >
      <SpinLoader v-if="loading" class="h-5 w-5" />
      <MagnifyingGlassIcon v-else class="h-5 w-5 text-gray-300" />
    </button>

    <!-- Rotating placeholder, shown while the field is empty -->
    <div v-show="!query" class="pointer-events-none absolute inset-0 flex items-center rounded-full">
      <Transition
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="opacity-0 translate-y-4"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-300 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-4"
        mode="out-in"
      >
        <p
          :key="currentPlaceholder"
          class="w-[calc(100%-2rem)] truncate pl-4 text-left text-sm font-normal text-neutral-500 sm:pl-10 sm:text-base dark:text-zinc-500"
        >
          {{ placeholders[currentPlaceholder] }}
        </p>
      </Transition>
    </div>
  </form>
</template>

<script lang="ts" setup>
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core';
import { MagnifyingGlassIcon } from '@heroicons/vue/16/solid';
import SpinLoader from '~/components/ui/SpinLoader.vue';

const props = withDefaults(
  defineProps<{
    placeholders?: string[];
    loading?: boolean;
  }>(),
  {
    placeholders: () => [],
    loading: false
  }
);

const query = defineModel<string>({ default: '' });
const emit = defineEmits<{ submit: [value: string] }>();

const inputRef = ref<HTMLInputElement | null>(null);
const currentPlaceholder = ref(0);

// Cycle placeholders every 3s, paused while the tab is hidden.
const { pause, resume } = useIntervalFn(() => {
  if (props.placeholders.length > 0) {
    currentPlaceholder.value = (currentPlaceholder.value + 1) % props.placeholders.length;
  }
}, 3000);

const visibility = useDocumentVisibility();
watch(visibility, state => (state === 'visible' ? resume() : pause()));

onMounted(() => {
  inputRef.value?.focus();
});
</script>
