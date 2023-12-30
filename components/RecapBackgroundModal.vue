<template>
  <div>
    <Modal v-model:is-open='isModalOpen'>
      <p class='font-semibold text-xl pb-4'>Background available</p>
      <div class='flex flex-wrap gap-2'>
        <div v-for='n in 5' class='w-32 h-32 bg-gray-300 rounded-xl flex items-center justify-center'>
          bg #{{ n }}
        </div>
      </div>
    </Modal>
  </div>
</template>
<script lang='ts' setup>
import Modal from '~/components/ui/Modal.vue';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:isOpen']);

const isModalOpen = computed({
  get: () => props.isOpen,
  set: val => {
    emit('update:isOpen', val);
  }
});

</script>
