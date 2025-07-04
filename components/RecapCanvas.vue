<template>
  <div class="w-full flex justify-center">
    <div class="px-4 flex flex-col items-end gap-4">
      <button class="py-2 px-4 btn btn-outline" @click="addTextbox()" :disabled="isAddingText">
        <span v-if="isAddingText" class="loading loading-spinner"></span>
        <span v-else class="flex items-center gap-2">
          <PlusCircleIcon class="h-5 w-5" />
          Add text
        </span>
      </button>
      <button class="py-2 px-4 btn btn-outline" @click="openBackgroundModal">
        <span class="flex items-center gap-2">
          <PhotoIcon class="h-5 w-5" />
          Choose background
        </span>
      </button>
      <button class="py-2 px-4 btn btn-outline" @click="clearSlide()">
        <span class="flex items-center gap-2">
          <ArrowPathRoundedSquareIcon class="h-5 w-5" />
          Reset slide
        </span>
      </button>
      <button
        v-if="selectedObject"
        class="py-2 px-4 btn btn-error btn-outline"
        @click="deleteText()"
      >
        <span class="flex items-center gap-2">
          <TrashIcon class="h-5 w-5" />
          Delete
        </span>
      </button>
    </div>
    <div
      :class="{ skeleton: loading }"
      class="w-[390px] h-[844px] bg-neutral rounded-3xl overflow-hidden shadow outline outline-4"
    >
      <canvas ref="canvasRef" height="844" width="390"></canvas>
    </div>
    <div class="px-4">
      <button
        class="opacity-0 py-2 px-4 bg-blue-600 hover:bg-blue-500 transition shadow rounded-full flex items-center gap-2"
      >
        <span>
          <PhotoIcon class="h-5 w-5" />
        </span>
        Choose background
      </button>
    </div>
    <RecapBackgroundModal v-model:is-open="isBackgroundModalOpen" />
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref, watch } from 'vue';
import * as fabric from 'fabric';
import { RoundedTextbox } from '~/utils/RoundedTextbox';
import {
  ArrowPathRoundedSquareIcon,
  PhotoIcon,
  PlusCircleIcon,
  TrashIcon
} from '@heroicons/vue/24/outline';

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  loading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue']);

const isBackgroundModalOpen = ref(false);
const isAddingText = ref(false);
const selectedObject = ref<fabric.Object | null>(null);

const canvasRef = ref<HTMLCanvasElement | undefined>(undefined);
let canvas: fabric.Canvas | null = null;
let isInternalUpdate = false;

const emitUpdate = () => {
  if (!canvas) return;
  isInternalUpdate = true;
  const json = JSON.stringify(canvas.toJSON());
  emit('update:modelValue', json);
};

watch(
  () => props.modelValue,
  newJson => {
    if (isInternalUpdate) {
      isInternalUpdate = false;
      return;
    }
    if (!canvas) return;
    canvas.loadFromJSON(newJson || '{}', () => {
      canvas?.renderAll();
      // Force a re-render on the next animation frame
      requestAnimationFrame(() => {
        canvas?.renderAll();
      });
    });
  },
  { immediate: true }
);

onMounted(() => {
  // @ts-ignore
  fabric.classRegistry.setClass(RoundedTextbox);
  if (!canvasRef.value) return;

  canvas = new fabric.Canvas(canvasRef.value);

  canvas.on('object:modified', emitUpdate);
  canvas.on('object:removed', emitUpdate);

  canvas.on('mouse:down', e => {
    selectedObject.value = e.target ?? null;
  });

  // Load initial value
  if (props.modelValue) {
    canvas.loadFromJSON(props.modelValue, () => {
      canvas?.renderAll();
    });
  }
});

onUnmounted(() => {
  canvas?.dispose();
});

const deleteText = () => {
  if (canvas && canvas.getActiveObject()) {
    canvas.remove(canvas.getActiveObject());
    canvas.discardActiveObject();
    // The 'object:removed' event will handle the emit.
  }
};

const openBackgroundModal = () => {
  isBackgroundModalOpen.value = true;
};

const clearSlide = () => {
  if (!canvas) return;
  canvas.clear();
  emitUpdate(); // Emit the empty state
};

const TEXTBOX_CONFIG = {
  fontSize: 32,
  fontFamily: '"Fredoka One", cursive',
  opacity: 1,
  textAlign: 'center',
  backgroundColor: '#fff',
  padding: 20,
  fill: '#000',
  objectCaching: false,
  editable: true
};

const addTextbox = async () => {
  if (!canvas || isAddingText.value) return;
  isAddingText.value = true;
  try {
    await document.fonts.load('1em "Fredoka One"');
    const textbox = new RoundedTextbox('Votre texte ici', TEXTBOX_CONFIG);
    canvas.add(textbox);
    canvas.setActiveObject(textbox);
    canvas.centerObject(textbox);
    textbox.enterEditing();
    emitUpdate(); // Explicitly emit the update
  } catch (error) {
    console.error('Failed to load font and add textbox:', error);
  } finally {
    isAddingText.value = false;
  }
};
</script>

