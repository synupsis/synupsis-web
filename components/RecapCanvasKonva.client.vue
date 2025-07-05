<template>
  <div class="w-full h-full relative">
    <div
      ref="containerRef"
      :class="{ skeleton: loading }"
      class="w-full h-full bg-neutral rounded-3xl overflow-hidden shadow flex items-center justify-center"
      :style="{ outline: readOnly ? 'none' : '4px solid' }"
    >
      <v-stage ref="stageRef" :config="stageConfig" @mousedown="handleStageMouseDown">
        <v-layer ref="layerRef">
          <v-image
            v-for="item in imageItems"
            :key="item.id"
            :config="item"
            @dragend="handleDragEnd"
            @transformend="handleTransformEnd"
          />
          <v-text
            v-for="item in textItems"
            :key="item.id"
            :config="item"
            @dragend="handleDragEnd"
            @transformend="handleTransformEnd"
            @dblclick="handleDblClick"
          />
          <v-transformer ref="transformerRef" />
        </v-layer>
      </v-stage>
    </div>

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
        v-if="selectedShapeName"
        class="py-2 px-4"
        variant="destructive"
        @click="deleteSelectedObject()"
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
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue';
import Konva from 'konva';
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
let isInternalUpdate = false;

const containerRef = ref<HTMLDivElement | null>(null);
const stageRef = ref<any>(null);
const transformerRef = ref<any>(null);

const originalWidth = 390;
const originalHeight = 844;

const stageConfig = ref({
  width: originalWidth,
  height: originalHeight,
  scaleX: 1,
  scaleY: 1,
});

// Treat images as objects, just like text
const imageItems = ref<any[]>([]);
const textItems = ref<any[]>([]);
const selectedShapeName = ref('');

const addImageToCanvas = (imageUrl: string) => {
  const proxiedUrl = `/api/images/proxy?url=${encodeURIComponent(imageUrl)}`;
  Konva.Image.fromURL(proxiedUrl, (image) => {
    const scale = originalWidth / image.width();
    imageItems.value.push({
      image: image.image(),
      x: 0,
      y: 0,
      scaleX: scale,
      scaleY: scale,
      draggable: !props.readOnly,
      name: `image-${Date.now()}`,
      id: `image-${Date.now()}`,
      src: proxiedUrl, // Save the proxied URL
    });
    nextTick(() => {
      emitUpdate();
    });
    toast.success('Image added to canvas!');
  });
};

const emitUpdate = () => {
  if (props.readOnly || !stageRef.value) return;
  isInternalUpdate = true;
  const stage = stageRef.value.getNode();
  const json = stage.toJSON();
  emit('update:modelValue', json);
};

const scaleAndPositionCanvas = () => {
  if (!containerRef.value || !stageRef.value) return;
  const containerWidth = containerRef.value.clientWidth;
  const containerHeight = containerRef.value.clientHeight;
  const scale = Math.min(containerWidth / originalWidth, containerHeight / originalHeight);
  stageConfig.value.width = originalWidth * scale;
  stageConfig.value.height = originalHeight * scale;
  stageConfig.value.scaleX = scale;
  stageConfig.value.scaleY = scale;
};

const loadCanvasFromJSON = (json: string) => {
  if (!json) {
    textItems.value = [];
    imageItems.value = [];
    return;
  }

  const data = JSON.parse(json);
  const layer = data.children?.[0];
  if (!layer) return;

  const textNodeConfigs = layer.children?.filter((c: any) => c.className === 'Text').map((c: any) => c.attrs) || [];
  const imageNodeConfigs = layer.children?.filter((c: any) => c.className === 'Image').map((c: any) => c.attrs) || [];

  if (props.readOnly) {
    textNodeConfigs.forEach(config => config.draggable = false);
    imageNodeConfigs.forEach(config => config.draggable = false);
  }

  transformerRef.value?.getNode().nodes([]);
  textItems.value = textNodeConfigs;

  // Asynchronously load images
  const loadedImages: any[] = [];
  let imagesToLoad = imageNodeConfigs.length;
  if (imagesToLoad === 0) {
    imageItems.value = [];
    return;
  }

  imageNodeConfigs.forEach((config: any) => {
    Konva.Image.fromURL(config.src, (image) => {
      loadedImages.push({
        ...config,
        image: image.image(),
      });
      imagesToLoad--;
      if (imagesToLoad === 0) {
        imageItems.value = loadedImages;
      }
    });
  });
};


watch(() => props.modelValue, (newJson) => {
  if (isInternalUpdate) {
    isInternalUpdate = false;
    return;
  }
  loadCanvasFromJSON(newJson);
});

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  scaleAndPositionCanvas();
  if (props.modelValue) {
    loadCanvasFromJSON(props.modelValue);
  }
  resizeObserver = new ResizeObserver(scaleAndPositionCanvas);
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value);
  }
});

onUnmounted(() => {
  if (resizeObserver && containerRef.value) {
    resizeObserver.unobserve(containerRef.value);
  }
});

const openBackgroundModal = () => {
  if (props.readOnly) return;
  isBackgroundModalOpen.value = true;
};

const addTextbox = () => {
  if (props.readOnly) return;
  const newText = {
    x: 50,
    y: 50,
    text: 'Votre texte ici',
    fontSize: 32,
    fontFamily: '"Fredoka One", cursive',
    fill: '#000',
    draggable: !props.readOnly,
    name: `text-${Date.now()}`,
    id: `text-${Date.now()}`
  };
  textItems.value.push(newText);
  nextTick(() => {
    emitUpdate();
  });
};

const deleteSelectedObject = () => {
  if (props.readOnly || !selectedShapeName.value) return;

  const isImage = selectedShapeName.value.startsWith('image-');
  const items = isImage ? imageItems : textItems;
  
  const index = items.value.findIndex(item => item.name === selectedShapeName.value);
  if (index > -1) {
    items.value.splice(index, 1);
    selectedShapeName.value = '';
    transformerRef.value.getNode().nodes([]);
    nextTick(() => {
      emitUpdate();
    });
  }
};

const clearSlide = () => {
  if (props.readOnly) return;
  imageItems.value = [];
  textItems.value = [];
  nextTick(() => {
    emitUpdate();
  });
  toast.info('Slide has been cleared.');
};

const handleStageMouseDown = (e: any) => {
  if (props.readOnly) return;

  if (e.target === e.target.getStage()) {
    selectedShapeName.value = '';
    updateTransformer();
    return;
  }

  const clickedOnTransformer = e.target.getParent().className === 'Transformer';
  if (clickedOnTransformer) {
    return;
  }

  const name = e.target.name();
  const allItems = [...textItems.value, ...imageItems.value];
  const item = allItems.find(i => i.name === name);
  
  if (item) {
    selectedShapeName.value = name;
  } else {
    selectedShapeName.value = '';
  }
  updateTransformer();
};

const updateTransformer = () => {
  const transformerNode = transformerRef.value.getNode();
  const stage = stageRef.value.getNode();
  const selectedNode = stage.findOne('.' + selectedShapeName.value);
  if (selectedNode) {
    transformerNode.nodes([selectedNode]);
  } else {
    transformerNode.nodes([]);
  }
};

const handleDragEnd = (e: any) => {
  const name = e.target.name();
  const isImage = name.startsWith('image-');
  const items = isImage ? imageItems : textItems;
  const index = items.value.findIndex(item => item.name === name);
  if (index > -1) {
    items.value[index].x = e.target.x();
    items.value[index].y = e.target.y();
    emitUpdate();
  }
};

const handleTransformEnd = (e: any) => {
  const name = e.target.name();
  const isImage = name.startsWith('image-');
  const items = isImage ? imageItems : textItems;
  const index = items.value.findIndex(item => item.name === name);
  if (index > -1) {
    const node = e.target;
    items.value[index].x = node.x();
    items.value[index].y = node.y();
    items.value[index].scaleX = node.scaleX();
    items.value[index].scaleY = node.scaleY();
    items.value[index].rotation = node.rotation();
    emitUpdate();
  }
};

const handleDblClick = (e: any) => {
  if (props.readOnly || e.target.className !== 'Text') return;
  const textNode = e.target;
  textNode.hide();
  transformerRef.value.getNode().hide();

  const textPosition = textNode.absolutePosition();
  const stageBox = stageRef.value.getNode().container().getBoundingClientRect();

  const areaPosition = {
    x: stageBox.left + textPosition.x,
    y: stageBox.top + textPosition.y,
  };

  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);

  textarea.value = textNode.text();
  textarea.style.position = 'absolute';
  textarea.style.top = areaPosition.y + 'px';
  textarea.style.left = areaPosition.x + 'px';
  textarea.style.width = textNode.width() - textNode.padding() * 2 + 'px';
  textarea.style.height = textNode.height() - textNode.padding() * 2 + 5 + 'px';
  textarea.style.fontSize = textNode.fontSize() + 'px';
  textarea.style.border = 'none';
  textarea.style.padding = '0px';
  textarea.style.margin = '0px';
  textarea.style.overflow = 'hidden';
  textarea.style.background = 'none';
  textarea.style.outline = 'none';
  textarea.style.resize = 'none';
  textarea.style.lineHeight = textNode.lineHeight();
  textarea.style.fontFamily = textNode.fontFamily();
  textarea.style.transformOrigin = 'left top';
  textarea.style.textAlign = textNode.align();
  textarea.style.color = textNode.fill();
  const rotation = textNode.rotation();
  let transform = '';
  if (rotation) {
    transform += 'rotateZ(' + rotation + 'deg)';
  }

  textarea.style.transform = transform;
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 3 + 'px';
  textarea.focus();

  function removeTextarea() {
    textarea.parentNode?.removeChild(textarea);
    window.removeEventListener('click', handleOutsideClick);
    textNode.show();
    transformerRef.value.getNode().show();
    transformerRef.value.getNode().forceUpdate();
  }

  function setTextareaWidth(newWidth: number) {
    if (!newWidth) {
      newWidth = textNode.placeholder.length * textNode.fontSize();
    }
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
    if (isSafari || isFirefox) {
      newWidth = Math.ceil(newWidth);
    }
    textarea.style.width = newWidth + 'px';
  }

  textarea.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      textNode.text(textarea.value);
      removeTextarea();
      emitUpdate();
    }
    if (e.key === 'Escape') {
      removeTextarea();
    }
  });

  textarea.addEventListener('keydown', () => {
    const scale = textNode.getAbsoluteScale().x;
    setTextareaWidth(textNode.width() * scale);
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + textNode.fontSize() + 'px';
  });

  function handleOutsideClick(e: any) {
    if (e.target !== textarea) {
      textNode.text(textarea.value);
      removeTextarea();
      emitUpdate();
    }
  }
  setTimeout(() => {
    window.addEventListener('click', handleOutsideClick);
  });
};

defineExpose({
  redraw: scaleAndPositionCanvas
});
</script>