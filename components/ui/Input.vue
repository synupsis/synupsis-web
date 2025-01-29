<template>
  <div>
    <input
      v-model="value"
      :name="name"
      :placeholder="placeholder"
      :type="type"
      class="input input-bordered w-full max-w-xs"
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
