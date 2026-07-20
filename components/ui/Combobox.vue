<template>
  <HeadlessCombobox v-model="selected" as="div" @update:model-value="select">
    <HeadlessComboboxLabel v-if="label" class="block text-sm font-medium leading-6 text-gray-900"
      >{{ label }}
    </HeadlessComboboxLabel>
    <div class="relative mt-2">
      <label class="input input-bordered flex items-center gap-2">
        <HeadlessComboboxInput
          :placeholder="placeholder"
          class="grow border-none outline-none focus:outline-none focus:ring-0"
          type="text"
          @change="search = readInputValue($event)"
        />
        <span v-if="itemsLoading" class="loading loading-spinner loading-sm opacity-70"></span>
        <HeadlessComboboxButton
          v-else-if="showChevronIcon"
          class="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none"
        >
          <ChevronUpDownIcon aria-hidden="true" class="h-5 w-5 text-gray-400" />
        </HeadlessComboboxButton>
        <slot v-else class="opacity-70" name="icon"></slot>
      </label>

      <HeadlessComboboxOptions
        v-if="items.length > 0"
        class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
      >
        <HeadlessComboboxOption
          v-for="item in items"
          :key="item.username"
          v-slot="{ active, selected }"
          :value="item"
          as="template"
        >
          <li
            :class="[
              'relative cursor-pointer select-none py-2 pl-3 pr-9',
              active ? 'bg-indigo-600 text-white' : 'text-gray-900'
            ]"
          >
            <div class="flex">
              <span :class="['truncate', selected && 'font-semibold']">
                {{ item.name }}
              </span>
              <span
                :class="[
                  'ml-2 truncate text-gray-500',
                  active ? 'text-indigo-200' : 'text-gray-500'
                ]"
              >
                {{ item.secondary }}
              </span>
            </div>

            <span
              v-if="selected"
              :class="[
                'absolute inset-y-0 right-0 flex items-center pr-4',
                active ? 'text-white' : 'text-indigo-600'
              ]"
            >
              <CheckIcon aria-hidden="true" class="h-5 w-5" />
            </span>
          </li>
        </HeadlessComboboxOption>
      </HeadlessComboboxOptions>
    </div>
  </HeadlessCombobox>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/vue/20/solid';
import { useDebounceFn } from '@vueuse/core';

type ComboboxItem = {
  username: string | number;
  name: string;
  secondary?: string;
};

type ModelValue = ComboboxItem | string | number | Date | unknown[] | null;

const props = withDefaults(defineProps<{
  showChevronIcon?: boolean;
  label?: string;
  placeholder?: string;
  items?: ComboboxItem[];
  fetchItems?: (search: ModelValue) => void | Promise<void>;
  modelValue?: ModelValue;
  itemsLoading?: boolean;
  clickAction?: (item: ComboboxItem | null) => void;
}>(), {
  showChevronIcon: true,
  label: '',
  placeholder: '',
  items: () => [],
  modelValue: null,
  itemsLoading: false,
});

const emit = defineEmits(['update:modelValue']);

const search = ref<ModelValue>(props.modelValue);

const selected = ref<ComboboxItem | null>(null);

const readInputValue = (event: Event) => (event.target as HTMLInputElement).value;

watch(
  search,
  useDebounceFn(() => props.fetchItems?.(search.value), 300)
);

const select = () => {
  emit('update:modelValue', selected.value);
  props.clickAction && props.clickAction(selected.value);
};
</script>
