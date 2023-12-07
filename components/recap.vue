<template>
  <TransitionRoot :show="isOpen" appear as="template">
    <Dialog as="div" @close="closeModal">
      <div class="fixed inset-0 z-30 overflow-y-auto">
        <div class="min-h-screen px-4 text-center">
          <TransitionChild
              as="template"
              enter="duration-300 ease-out"
              enter-from="opacity-0"
              enter-to="opacity-100"
              leave="duration-200 ease-in"
              leave-from="opacity-100"
              leave-to="opacity-0"
          >
            <DialogOverlay class="fixed inset-0 bg-gray-500 bg-opacity-75" />
          </TransitionChild>

          <!-- This element is to trick the browser into centering the modal contents. -->
          <span aria-hidden="true" class="hidden sm:inline-block sm:align-middle sm:h-screen"
          >&#8203;</span
          >

          <TransitionChild
              as="template"
              enter="duration-300 ease-out"
              enter-from="opacity-0 scale-95"
              enter-to="opacity-100 scale-100"
              leave="duration-200 ease-in"
              leave-from="opacity-100 scale-100"
              leave-to="opacity-0 scale-95"
          >
            <div
                class="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl h-[90vh]"
            >

              <div class="absolute top-0 right-0 pt-4 pr-4">
                <button
                    class="bg-white rounded-md text-gray-400 hover:text-gray-500 "
                    tabindex="-1"
                    type="button"
                    @click="closeModal"
                >
                  <span class="sr-only">Close</span>

                  <XMarkIcon class="h-6 w-6"></XMarkIcon>
                </button>
              </div>
              <div class="text-black">Recap will be here</div>
            </div>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>

<script setup>
import {
  Dialog,
  DialogOverlay,
  TransitionChild,
  TransitionRoot
} from '@headlessui/vue';

import { XMarkIcon } from '@heroicons/vue/24/outline';

defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:isOpen']);

const closeModal = () => {
  emit('update:isOpen', false);
};
</script>
