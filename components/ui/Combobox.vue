<template>
  <Combobox v-model="selected" as="div">
    <ComboboxLabel v-if="label" class="block text-sm font-medium leading-6 text-gray-900">{{ label }}</ComboboxLabel>
    <div class="relative mt-2">
      <ComboboxInput @change="search = $event.target.value" :placeholder="placeholder"
                     class="w-full rounded-md border-0 bg-white py-1.5 pl-3 pr-12 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
      />
      <div v-if="itemsLoading" class="absolute inset-y-0 right-0 flex items-center px-2">
        <div class="border-gray-300 h-5 w-5 animate-spin rounded-full border-4 border-t-blue-600"/>
      </div>
      <ComboboxButton v-else-if="showChevronIcon"
                      class="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
        <ChevronUpDownIcon class="h-5 w-5 text-gray-400" aria-hidden="true"/>
      </ComboboxButton>

      <ComboboxOptions v-if="items.length > 0"
                       class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
        <ComboboxOption v-for="item in items" :key="item.username" :value="item" as="template"
                        v-slot="{ active, selected }">
          <li @click="select(item)" :class="['relative cursor-pointer select-none py-2 pl-3 pr-9', active ? 'bg-indigo-600 text-white' : 'text-gray-900']">
            <div class="flex">
              <span :class="['truncate', selected && 'font-semibold']">
                {{ item.name }}
              </span>
              <span :class="['ml-2 truncate text-gray-500', active ? 'text-indigo-200' : 'text-gray-500']">
                {{ item.secondary }}
              </span>
            </div>

            <span v-if="selected"
                  :class="['absolute inset-y-0 right-0 flex items-center pr-4', active ? 'text-white' : 'text-indigo-600']">
              <CheckIcon class="h-5 w-5" aria-hidden="true"/>
            </span>
          </li>
        </ComboboxOption>
      </ComboboxOptions>
    </div>
  </Combobox>
</template>

<script setup>
import {computed, ref} from 'vue'
import {CheckIcon, ChevronUpDownIcon} from '@heroicons/vue/20/solid'
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxLabel,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/vue'
import useUtils from '~/composables/useUtils'

const {debounce} = useUtils();

const props = defineProps({
  showChevronIcon: {
    type: Boolean,
    default: true,
  },
  label: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
  items: {
    type: Array,
    default: () => [],
  },
  fetchItems: {type: Function},
  modelValue: {type: [String, Array, Number, Date], default: undefined},
  itemsLoading: {type: Boolean, default: false},
  clickAction: {type: Function},
})

const emit = defineEmits(['update:modelValue'])

const search = ref(props.modelValue);

const selected = ref(null)

watch(
    search,
    debounce(() => props.fetchItems && props.fetchItems(search.value))
);

const select = (item) => {
  selected.value = item;
  emit('update:modelValue', item);
  props.clickAction && props.clickAction(item);
}

</script>
