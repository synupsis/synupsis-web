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
      <Button class="py-2 px-4" variant="outline" @click="addTextbox()" :disabled="isAddingText">
        <span v-if="isAddingText" class="loading loading-spinner"></span>
        <span v-else class="flex items-center gap-2">
          <PlusCircleIcon class="h-5 w-5" />
          Add text
        </span>
      </Button>
      <Button class="py-2 px-4" variant="outline" @click="openBackgroundModal">
        <span class="flex items-center gap-2">
          <PhotoIcon class="h-5 w-5" />
          Add Image
        </span>
      </Button>
      <Button class="py-2 px-4" variant="outline" @click="clearSlide()">
        <span class="flex items-center gap-2">
          <ArrowPathRoundedSquareIcon class="h-5 w-5" />
          Reset slide
        </span>
      </Button>
      <Button
        v-if="selectedObject"
        class="py-2 px-4"
        variant="destructive"
        @click="deleteText()"
      >
        <span class="flex items-center gap-2">
          <TrashIcon class="h-5 w-5" />
          Delete
        </span>
      </Button>
    </div>

    <RecapBackgroundModal
      v-if="seasonId"
      v-model:is-open="isBackgroundModalOpen"
      :season-id="seasonId"
      @select-image="addImageToCanvas"
    />
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
import { Button } from '~/components/shadcn/button';
import { toast } from 'vue-sonner';

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
  },
  seasonId: {
    type: String,
    default: null
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

const addImageToCanvas = async (imageUrl: string) => {
  if (!canvas) return;

  const proxiedUrl = `/api/images/proxy?url=${encodeURIComponent(imageUrl)}`;

  try {
    const response = await fetch(proxiedUrl);
    if (!response.ok) throw new Error(`Proxy fetch failed: ${response.statusText}`);
    
    const imageBlob = await response.blob();
    const objectURL = URL.createObjectURL(imageBlob);

    const imageElement = new Image();
    imageElement.src = objectURL;
    
    imageElement.onload = () => {
      if (!canvas) {
        URL.revokeObjectURL(objectURL);
        return;
      }
      
      const fabricImage = new fabric.Image(imageElement);
      
      // @ts-ignore - Add custom property to store the permanent URL
      fabricImage.originalUrl = imageUrl;
      
      const scale = originalWidth / (fabricImage.width ?? 1);
      fabricImage.scale(scale);

      canvas.add(fabricImage);
      fabricImage.sendToBack(); // This is the correct method
      canvas.renderAll();
      
      emitUpdate();
      toast.success('Image added to canvas!');
      URL.revokeObjectURL(objectURL);
    };

    imageElement.onerror = () => {
      toast.error('Failed to load image', { description: 'The image element could not be loaded.' });
      URL.revokeObjectURL(objectURL);
    };

  } catch (error) {
    toast.error('Failed to load image', { description: 'Could not fetch or process the image.' });
  }
};

const emitUpdate = () => {
  if (props.readOnly || !canvas) return;
  isInternalUpdate = true;
  const json = JSON.stringify(canvas.toJSON(['originalUrl']));
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

const reloadImagesFromPermanentUrl = () => {
  if (!canvas) return;
  
  const images = canvas.getObjects('image');
  images.forEach((img) => {
    // @ts-ignore
    const originalUrl = img.originalUrl;
    if (originalUrl) {
      (async (imageObject) => {
        try {
          const proxiedUrl = `/api/images/proxy?url=${encodeURIComponent(originalUrl)}`;
          const response = await fetch(proxiedUrl);
          if (!response.ok) throw new Error('Proxy fetch failed');
          
          const imageBlob = await response.blob();
          const objectURL = URL.createObjectURL(imageBlob);
          
          imageObject.setSrc(objectURL, () => {
            canvas?.renderAll();
            URL.revokeObjectURL(objectURL);
          });
        } catch (error) {
          console.error('Failed to reload image:', originalUrl, error);
        }
      })(img);
    }
  });
};

const loadCanvasFromJSON = (json: string) => {
  if (!canvas) return;

  // Pre-process the JSON to prevent loading invalid blob URLs
  const data = JSON.parse(json || '{}');
  if (data.objects) {
    data.objects.forEach((obj: any) => {
      if (obj.type === 'image' && obj.originalUrl) {
        obj.src = ''; // Erase the dead blob URL
      }
    });
  }

  canvas.loadFromJSON(data, () => {
    scaleAndPositionCanvas();
    reloadImagesFromPermanentUrl(); // Now, reload the images from their permanent URLs
    
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
      canvas.on('object:removed',emitUpdate);
    }
  });
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
    
    loadCanvasFromJSON(newJson);
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
    loadCanvasFromJSON(props.modelValue);
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
  canvas.renderAll();
  emitUpdate();
  toast.info('Slide has been cleared.');
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