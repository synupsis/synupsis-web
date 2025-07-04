<template>
  <div class="w-full h-full relative">
    <!-- The canvas container now takes up the full space of its parent from recap-editor.vue -->
    <div
      ref="canvasContainerRef"
      :class="{ skeleton: loading }"
      class="w-full h-full bg-neutral rounded-3xl overflow-hidden shadow flex items-center justify-center"
      :style="{ outline: readOnly ? 'none' : '4px solid' }"
    >
      <canvas ref="canvasRef"></canvas>
    </div>

    <!-- The buttons are positioned absolutely, so they don't affect the layout -->
    <div v-if="!readOnly" class="absolute top-1/2 -translate-y-1/2 right-full mr-4 z-10 flex flex-col items-start gap-4">
      <button class="py-2 px-4 btn btn-outline bg-background" @click="addTextbox()" :disabled="isAddingText">
        <span v-if="isAddingText" class="loading loading-spinner"></span>
        <span v-else class="flex items-center gap-2">
          <PlusCircleIcon class="h-5 w-5" />
          Add text
        </span>
      </button>
      <button class="py-2 px-4 btn btn-outline bg-background" @click="openBackgroundModal">
        <span class="flex items-center gap-2">
          <PhotoIcon class="h-5 w-5" />
          Choose background
        </span>
      </button>
      <button class="py-2 px-4 btn btn-outline bg-background" @click="clearSlide()">
        <span class="flex items-center gap-2">
          <ArrowPathRoundedSquareIcon class="h-5 w-5" />
          Reset slide
        </span>
      </button>
      <button
        v-if="selectedObject"
        class="py-2 px-4 btn btn-error btn-outline bg-background"
        @click="deleteText()"
      >
        <span class="flex items-center gap-2">
          <TrashIcon class="h-5 w-5" />
          Delete
        </span>
      </button>
    </div>

    <RecapBackgroundModal v-if="!readOnly" v-model:is-open="isBackgroundModalOpen" />
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
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
  },
  readOnly: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue']);

const isBackgroundModalOpen = ref(false);
const isAddingText = ref(false);
const selectedObject = ref<fabric.Object | null>(null);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const canvasContainerRef = ref<HTMLDivElement | null>(null);
let canvas: fabric.Canvas | null = null;
let isInternalUpdate = false;

const originalWidth = 390;
const originalHeight = 844;

const emitUpdate = () => {
  if (props.readOnly || !canvas) return;
  isInternalUpdate = true;
  const json = JSON.stringify(canvas.toJSON());
  emit('update:modelValue', json);
};

const scaleAndPositionCanvas = () => {
  if (!canvas || !canvasContainerRef.value) return;

  const containerWidth = canvasContainerRef.value.clientWidth;
  const containerHeight = canvasContainerRef.value.clientHeight;

  const scale = Math.min(
    containerWidth / originalWidth,
    containerHeight / originalHeight
  );

  const newWidth = originalWidth * scale;
  const newHeight = originalHeight * scale;

  canvas.setWidth(newWidth);
  canvas.setHeight(newHeight);
  canvas.setZoom(scale);
  canvas.renderAll();
};

watch(
  () => props.modelValue,
  newJson => {
    if (isInternalUpdate) {
      isInternalUpdate = false;
      return;
    }
    if (!canvas) return;

    if (!props.readOnly) {
      canvas.off('object:modified', emitUpdate);
      canvas.off('object:removed',emitUpdate);
    }

    canvas.loadFromJSON(newJson || '{}', () => {
      scaleAndPositionCanvas();
      if (props.readOnly) {
        canvas?.forEachObject(obj => {
          obj.selectable = false;
          obj.evented = false;
        });
      }
      
      requestAnimationFrame(() => {
        canvas?.renderAll();
      });

      if (!props.readOnly) {
        canvas.on('object:modified', emitUpdate);
        canvas.on('object:removed', emitUpdate);
      }
    });
  },
  { immediate: true }
);

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  // @ts-ignore
  fabric.classRegistry.setClass(RoundedTextbox);
  if (!canvasRef.value || !canvasContainerRef.value) return;

  canvas = new fabric.Canvas(canvasRef.value, {
    selection: !props.readOnly,
    backgroundColor: 'transparent',
  });

  if (!props.readOnly) {
    canvas.on('object:modified', emitUpdate);
    canvas.on('object:removed', emitUpdate);
    canvas.on('mouse:down', e => {
      selectedObject.value = e.target ?? null;
    });
  }

  if (props.modelValue) {
    canvas.loadFromJSON(props.modelValue, () => {
      if (props.readOnly) {
        canvas?.forEachObject(obj => {
          obj.selectable = false;
          obj.evented = false;
        });
      }
      scaleAndPositionCanvas();
    });
  } else {
    scaleAndPositionCanvas();
  }

  resizeObserver = new ResizeObserver(scaleAndPositionCanvas);
  resizeObserver.observe(canvasContainerRef.value);
});

onUnmounted(() => {
  if (resizeObserver && canvasContainerRef.value) {
    resizeObserver.unobserve(canvasContainerRef.value);
  }
  canvas?.dispose();
});

const deleteText = () => {
  if (props.readOnly || !canvas || !canvas.getActiveObject()) return;
  canvas.remove(canvas.getActiveObject());
  canvas.discardActiveObject();
};

const openBackgroundModal = () => {
  if (props.readOnly) return;
  isBackgroundModalOpen.value = true;
};

const clearSlide = () => {
  if (props.readOnly || !canvas) return;
  canvas.clear();
  emitUpdate();
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
  if (props.readOnly || !canvas || isAddingText.value) return;
  isAddingText.value = true;
  try {
    await document.fonts.load('1em "Fredoka One"');
    const textbox = new RoundedTextbox('Votre texte ici', TEXTBOX_CONFIG);
    canvas.add(textbox);
    canvas.setActiveObject(textbox);
    canvas.centerObject(textbox);
    textbox.enterEditing();
    emitUpdate();
  } catch (error) {
    console.error('Failed to load font and add textbox:', error);
  } finally {
    isAddingText.value = false;
  }
};

defineExpose({
  redraw: () => {
    if (canvas) {
      scaleAndPositionCanvas();
      requestAnimationFrame(() => {
        canvas?.renderAll();
      });
    }
  }
});
</script>
