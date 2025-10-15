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
          <v-group
            v-for="item in groupItems"
            :key="item.id"
            :config="item"
            @dragend="handleDragEnd"
            @transformend="handleTransformEnd"
            @dblclick="handleDblClick"
          >
            <v-rect :config="item.rect" />
            <v-text :config="item.text" />
          </v-group>
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

    <RecapImageModal
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
import RecapImageModal from '~/components/RecapImageModal.vue';
import { hexToRgb } from '~/lib/utils';

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
  },
  selectedElementId: {
    type: String,
    default: null
  }
});

const emit = defineEmits(['update:modelValue', 'select-element']);

watch(() => props.selectedElementId, (newId) => {
  if (newId) {
    selectedShapeName.value = newId;
    updateTransformer();
  }
});

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

const imageItems = ref<any[]>([]);
const groupItems = ref<any[]>([]);
const selectedShapeName = ref('');

const addImageToCanvas = (imageUrl: string) => {
  const proxiedUrl = `/api/image-proxy/?url=${encodeURIComponent(imageUrl)}`;
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
      src: proxiedUrl,
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
    groupItems.value = [];
    imageItems.value = [];
    return;
  }

  let data: any;
  try {
    data = JSON.parse(json);
  } catch (error) {
    console.error('Failed to parse canvas JSON', error);
    return;
  }

  const layers = Array.isArray(data?.children) ? data.children : [];
  const layer = layers[0];
  if (!layer) {
    groupItems.value = [];
    imageItems.value = [];
    return;
  }

  const layerChildren = Array.isArray(layer?.children) ? layer.children : [];

  const groupNodes = layerChildren.filter((c: any) => c?.className === 'Group');
  const imageNodeConfigs = layerChildren
    .filter((c: any) => c?.className === 'Image')
    .map((c: any) => c?.attrs)
    .filter((attrs: any) => !!attrs);

  if (props.readOnly) {
    groupNodes.forEach(group => {
      if (group?.attrs) {
        group.attrs.draggable = false;
      }
    });
    imageNodeConfigs.forEach(config => {
      config.draggable = false;
    });
  }

  transformerRef.value?.getNode().nodes([]);
  const groups: any[] = [];
  groupNodes.forEach((groupNode: any, index: number) => {
    const attrs = groupNode?.attrs || {};
    const children = Array.isArray(groupNode?.children) ? groupNode.children : [];
    const rectChild = children.find((c: any) => c?.className === 'Rect');
    const textChild = children.find((c: any) => c?.className === 'Text');

    if (!rectChild || !textChild) {
      console.warn('Skipping group with missing Rect/Text nodes', attrs?.id || index);
      return;
    }

    groups.push({
      ...attrs,
      id: attrs.id || `group-${Date.now()}-${index}`,
      rect: rectChild.attrs,
      text: textChild.attrs,
    });
  });
  groupItems.value = groups;

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
  const id = `group-${Date.now()}`;
  const textConfig = {
    text: 'Votre texte ici',
    fontSize: 32,
    fontFamily: 'Inter, sans-serif',
    fill: hexToRgb('#000'),
    padding: 10, // Reduced padding
    width: 300, // Default width for wrapping
    wrap: 'word',
  };
  const text = new Konva.Text(textConfig);
  const rectConfig = {
    width: text.width(),
    height: text.height(),
    fill: hexToRgb('#fff'),
    cornerRadius: 10, // Rounded corners
  };
  groupItems.value.push({
    id,
    name: id,
    x: 50,
    y: 50,
    draggable: !props.readOnly,
    rect: rectConfig,
    text: textConfig,
  });
  nextTick(() => {
    emitUpdate();
  });
};

const deleteSelectedObject = () => {
  if (props.readOnly || !selectedShapeName.value) return;

  const isImage = selectedShapeName.value.startsWith('image-');
  const items = isImage ? imageItems : groupItems;
  
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
  groupItems.value = [];
  nextTick(() => {
    emitUpdate();
  });
  toast.info('Slide has been cleared.');
};

const handleStageMouseDown = (e: any) => {
  if (props.readOnly) return;

  // Clicked on stage to deselect
  if (e.target === e.target.getStage()) {
    selectedShapeName.value = '';
    updateTransformer();
    emit('select-element', null);
    return;
  }

  // Clicked on transformer
  const clickedOnTransformer = e.target.getParent() && e.target.getParent().className === 'Transformer';
  if (clickedOnTransformer) {
    return;
  }

  // Find the clicked shape
  let shape = e.target;
  if (shape.className === 'Text' || shape.className === 'Rect') {
    shape = shape.getParent();
  }
  
  selectedShapeName.value = shape.name();
  updateTransformer();
  emit('select-element', shape.attrs);
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
  const items = isImage ? imageItems : groupItems;
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
  const items = isImage ? imageItems : groupItems;
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
  const group = e.target.getParent();
  const textNode = e.target;
  
  group.hide();
  transformerRef.value.getNode().hide();

  const textPosition = group.absolutePosition();
  const stageBox = stageRef.value.getNode().container().getBoundingClientRect();
  const scale = stageRef.value.getNode().scaleX();

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
  textarea.style.border = 'none';
  textarea.style.padding = textNode.padding() * scale + 'px';
  textarea.style.margin = '0px';
  textarea.style.overflow = 'hidden';
  textarea.style.background = '#fff';
  textarea.style.borderRadius = '10px';
  textarea.style.outline = 'none';
  textarea.style.resize = 'none';
  textarea.style.lineHeight = textNode.lineHeight();
  textarea.style.fontFamily = textNode.fontFamily();
  textarea.style.transformOrigin = 'left top';
  textarea.style.textAlign = textNode.align();
  textarea.style.color = textNode.fill();
  textarea.style.fontSize = textNode.fontSize() * scale + 'px';
  const konvaTextWidth = textNode.attrs.width || textNode.width();
  textarea.style.width = konvaTextWidth * scale + 'px';
  textarea.style.height = textNode.height() * scale + 'px';
  
  const rotation = group.rotation();
  let transform = '';
  if (rotation) {
    transform += 'rotateZ(' + rotation + 'deg)';
  }
  textarea.style.transform = transform;

  const resizeTextarea = () => {
    const text = new Konva.Text({
      text: textarea.value,
      fontSize: textNode.fontSize(),
      fontFamily: textNode.fontFamily(),
      padding: textNode.padding(),
      width: textNode.attrs.width, // Use the same width as the Konva.Text node
    });
    const groupScaleX = group.scaleX();
    const groupScaleY = group.scaleY();
    textarea.style.width = text.width() * groupScaleX * scale + 'px';
    textarea.style.height = text.height() * groupScaleY * scale + 'px';
  };

  resizeTextarea();
  textarea.focus();

  function removeTextarea() {
    textarea.parentNode?.removeChild(textarea);
    window.removeEventListener('click', handleOutsideClick);
    group.show();
    transformerRef.value.getNode().show();
    transformerRef.value.getNode().forceUpdate();
  }

  function handleOutsideClick(e: any) {
    if (e.target !== textarea) {
      const index = groupItems.value.findIndex(item => item.name === group.name());
      if (index > -1) {
        groupItems.value[index].text.text = textarea.value;
        const text = new Konva.Text(groupItems.value[index].text);
        groupItems.value[index].rect.width = text.width();
        groupItems.value[index].rect.height = text.height();
        groupItems.value[index].text.width = text.width(); // Update text width
      }
      removeTextarea();
      emitUpdate();
    }
  }

  textarea.addEventListener('input', resizeTextarea);

  textarea.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleOutsideClick({ target: null });
    }
    if (e.key === 'Escape') {
      removeTextarea();
    }
  });

  setTimeout(() => {
    window.addEventListener('click', handleOutsideClick);
  });
};

defineExpose({
  redraw: scaleAndPositionCanvas
});
</script>
