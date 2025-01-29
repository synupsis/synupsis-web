<template>
  <div class="w-full flex justify-center">
    <div class="px-4 flex flex-col items-end gap-4">
      <button class="py-2 px-4 btn btn-outline" @click="addTextbox()">
        <span>
          <PlusCircleIcon class="h-5 w-5" />
        </span>
        Add text
      </button>
      <button class="py-2 px-4 btn btn-outline" @click="openBackgroundModal">
        <span>
          <PhotoIcon class="h-5 w-5" />
        </span>
        Choose background
      </button>
      <button class="py-2 px-4 btn btn-outline" @click="clearSlide()">
        <span>
          <ArrowPathRoundedSquareIcon class="h-5 w-5" />
        </span>
        Reset slide
      </button>
      <button
        v-if="selectedObject"
        class="py-2 px-4 btn btn-error btn-outline"
        @click="deleteText()"
      >
        <span>
          <TrashIcon class="h-5 w-5" />
        </span>
        Delete
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
import { type Canvas as CanvasType, Canvas } from 'fabric';
import { RoundedTextbox } from '~/utils/RoundedTextbox';

import {
  ArrowPathRoundedSquareIcon,
  PhotoIcon,
  PlusCircleIcon,
  TrashIcon
} from '@heroicons/vue/24/outline';

const props = defineProps({
  image: {
    type: String,
    default: ''
  },
  json: {
    type: String,
    default: ''
  },
  loading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:json']);

const isBackgroundModalOpen = ref(false);
const selectedObject = ref(null);

const canvasRef = ref(undefined);
let canvas: CanvasType | null = null;

const emitCanvasState = () => {
  canvas?.renderAll();
  emit('update:json', JSON.stringify(canvas?.toJSON()));
};

onMounted(() => {
  canvas = new Canvas(canvasRef.value);

  canvas.on('object:modified', () => {
    emitCanvasState();
  });

  canvas.on('object:added', () => {
    emitCanvasState();
  });

  canvas.on('mouse:down', e => {
    if (e.target) {
      selectedObject.value = e.target;
    } else {
      selectedObject.value = null;
    }
  });
});

onUnmounted(() => {
  canvas?.dispose();
});

watch(
  () => props.json,
  json => {
    if (!canvas) return;
    canvas.clear();
    canvas.loadFromJSON(json, canvas.renderAll.bind(canvas));
  }
);

const deleteText = () => {
  if (selectedObject.value && canvas) {
    canvas.remove(canvas.getActiveObject());
    selectedObject.value = null;
    canvas.renderAll();
    emitCanvasState();
  }
};

const openBackgroundModal = () => {
  isBackgroundModalOpen.value = true;
};

const clearSlide = () => {
  if (!canvas) return;
  canvas.clear();
  emitCanvasState();
};

const addTextbox = () => {
  if (!canvas) return;

  const textbox = new RoundedTextbox('Votre texte ici', {
    width: 200,
    fontSize: 20,
    fontFamily: 'Arial',
    opacity: 1,
    textAlign: 'left',
    backgroundColor: '#fff',
    padding: 15,
    fill: '#000',
    objectCaching: false,
    editable: true
  });

  canvas.add(textbox);
  canvas.setActiveObject(textbox);
  canvas.centerObject(textbox);
  textbox.enterEditing();
  emitCanvasState();
};
</script>
