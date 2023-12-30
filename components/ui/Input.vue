<template>
  <div>
    <input
      v-model="value"
      class="placeholder:italic placeholder:text-slate-400 text-black block bg-white w-full border border-slate-300 rounded-md py-2 pr-3 shadow-sm focus:outline-none focus:border-sky-500 focus:ring-sky-500 focus:ring-1 sm:text-xs"
      :placeholder="placeholder"
      :type="type"
      :name="name"
    />
  </div>
</template>

<script lang="ts" setup>
const emit = defineEmits(['update:modelValue']);

const props = defineProps({
  type: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  placeholder: {
    type: String,
    default: ''
  },
  modelValue: {
    type: [String, Date],
    default: ''
  }
});

const value = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val)
});
</script>
