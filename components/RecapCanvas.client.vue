<template>
  <div class="w-full h-full relative">
    <div
      ref="containerRef"
      :class="{ skeleton: loading }"
      class="w-full h-full bg-neutral rounded-3xl overflow-hidden shadow flex items-center justify-center"
      :style="{ outline: readOnly ? 'none' : '4px solid' }"
    >
      <v-stage ref="stageRef" :config="stageConfig" @mousedown="handleStageMouseDown">
        <v-layer>
          <template v-for="item in visibleCanvasItems" :key="item.key">
            <v-image
              v-if="item.kind === 'image'"
              :config="item.config"
              @dragend="handleDragEnd"
              @transformend="handleTransformEnd"
            />
            <v-rect
              v-else-if="item.kind === 'rect'"
              :config="item.config"
              @dragend="handleDragEnd"
              @transformend="handleTransformEnd"
            />
            <v-group
              v-else
              :config="item.config"
              @dragend="handleDragEnd"
              @transformend="handleTransformEnd"
              @dblclick="handleDblClick"
            >
              <v-rect :config="item.rect" />
              <v-text :config="item.text" />
            </v-group>
          </template>
          <v-transformer v-if="!readOnly" ref="transformerRef" />
        </v-layer>
      </v-stage>
    </div>

    <div v-if="!readOnly" class="absolute top-1/2 -translate-y-1/2 right-full mr-4 z-10 flex flex-col items-start gap-4">
      <Button v-if="!visualOnly" class="py-2 px-4" variant="outline" @click="addTextbox">
        <span class="flex items-center gap-2">
          <PlusCircleIcon class="h-5 w-5" />
          Add text
        </span>
      </Button>
      <Button class="py-2 px-4" variant="outline" @click="openBackgroundModal">
        <span class="flex items-center gap-2">
          <PhotoIcon class="h-5 w-5" />
          {{ visualOnly ? 'Change image' : 'Add Image' }}
        </span>
      </Button>
      <Button v-if="!visualOnly" class="py-2 px-4" variant="outline" @click="clearSlide">
        <span class="flex items-center gap-2">
          <ArrowPathRoundedSquareIcon class="h-5 w-5" />
          Reset slide
        </span>
      </Button>
      <Button
        v-if="selectedShapeName"
        class="py-2 px-4"
        variant="destructive"
        @click="deleteSelectedObject"
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import Konva from 'konva';
import {
  ArrowPathRoundedSquareIcon,
  PhotoIcon,
  PlusCircleIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';
import { Button } from '~/components/shadcn/button';
import { toast } from 'vue-sonner';
import RecapImageModal from '~/components/RecapImageModal.vue';
import { hexToRgb } from '~/lib/utils';

type BaseCanvasItem = {
  key: string;
  config: Record<string, any>;
};

type ImageCanvasItem = BaseCanvasItem & { kind: 'image' };
type RectCanvasItem = BaseCanvasItem & { kind: 'rect' };
type GroupCanvasItem = BaseCanvasItem & {
  kind: 'group';
  rect: Record<string, any>;
  text: Record<string, any>;
};
type CanvasItem = ImageCanvasItem | RectCanvasItem | GroupCanvasItem;

const props = withDefaults(defineProps<{
  modelValue?: string;
  loading?: boolean;
  readOnly?: boolean;
  seasonId?: string | null;
  selectedElementId?: string | null;
  visualOnly?: boolean;
}>(), {
  modelValue: '',
  loading: false,
  readOnly: false,
  seasonId: null,
  selectedElementId: null,
  visualOnly: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'select-element': [value: any];
}>();

const originalWidth = 390;
const originalHeight = 844;
const containerRef = ref<HTMLDivElement | null>(null);
const stageRef = ref<any>(null);
const transformerRef = ref<any>(null);
const canvasItems = ref<CanvasItem[]>([]);
const selectedShapeName = ref('');
const isBackgroundModalOpen = ref(false);
const stageMetadata = ref<Record<string, unknown>>({});
const stageConfig = ref({ width: originalWidth, height: originalHeight, scaleX: 1, scaleY: 1 });
const visibleCanvasItems = computed(() => (
  props.visualOnly ? canvasItems.value.filter(item => item.kind === 'image') : canvasItems.value
));

let isInternalUpdate = false;
let imageLoadRevision = 0;
let resizeObserver: ResizeObserver | null = null;

watch(() => props.selectedElementId, (newId) => {
  selectedShapeName.value = newId || '';
  updateTransformer();
});

watch(() => props.modelValue, (newJson) => {
  if (isInternalUpdate) {
    isInternalUpdate = false;
    return;
  }
  loadCanvasFromJSON(newJson);
});

onMounted(() => {
  scaleAndPositionCanvas();
  loadCanvasFromJSON(props.modelValue);
  resizeObserver = new ResizeObserver(scaleAndPositionCanvas);
  if (containerRef.value) resizeObserver.observe(containerRef.value);
});

onUnmounted(() => {
  imageLoadRevision += 1;
  if (resizeObserver && containerRef.value) resizeObserver.unobserve(containerRef.value);
});

function scaleAndPositionCanvas() {
  if (!containerRef.value) return;
  const scale = Math.min(
    containerRef.value.clientWidth / originalWidth,
    containerRef.value.clientHeight / originalHeight,
  );
  stageConfig.value = {
    width: originalWidth * scale,
    height: originalHeight * scale,
    scaleX: scale,
    scaleY: scale,
  };
}

function loadCanvasFromJSON(json: string) {
  imageLoadRevision += 1;
  const revision = imageLoadRevision;
  selectedShapeName.value = '';
  transformerRef.value?.getNode()?.nodes([]);

  if (!json) {
    canvasItems.value = [];
    stageMetadata.value = {};
    return;
  }

  let data: any;
  try {
    data = JSON.parse(json);
  } catch (error) {
    console.error('Failed to parse canvas JSON', error);
    canvasItems.value = [];
    return;
  }

  stageMetadata.value = {
    durationMs: data?.attrs?.durationMs,
    formatVersion: data?.attrs?.formatVersion,
  };
  const children = Array.isArray(data?.children?.[0]?.children) ? data.children[0].children : [];
  const nextItems: CanvasItem[] = [];

  children.forEach((child: any, index: number) => {
    const attrs = { ...(child?.attrs || {}) };
    const key = String(attrs.id || attrs.name || `${child?.className || 'node'}-${index}`);

    if (child?.className === 'Rect') {
      nextItems.push({ kind: 'rect', key, config: disableDraggingWhenReadOnly(attrs) });
      return;
    }

    if (child?.className === 'Group') {
      const groupChildren = Array.isArray(child.children) ? child.children : [];
      const rect = groupChildren.find((node: any) => node?.className === 'Rect')?.attrs;
      const text = groupChildren.find((node: any) => node?.className === 'Text')?.attrs;
      if (!rect || !text) return;
      nextItems.push({
        kind: 'group',
        key,
        config: disableDraggingWhenReadOnly({
          ...attrs,
          id: attrs.id || key,
          name: attrs.name || key,
          draggable: props.visualOnly ? false : attrs.draggable,
        }),
        rect: { ...rect },
        text: { ...text },
      });
      return;
    }

    if (child?.className === 'Image' && typeof attrs.src === 'string') {
      const item: ImageCanvasItem = {
        kind: 'image',
        key,
        config: disableDraggingWhenReadOnly({ ...attrs, id: attrs.id || key, name: attrs.name || key }),
      };
      nextItems.push(item);
      loadImage(item, revision);
    }
  });

  canvasItems.value = nextItems;
}

function loadImage(item: ImageCanvasItem, revision: number) {
  Konva.Image.fromURL(
    item.config.src,
    (image) => {
      if (revision !== imageLoadRevision) return;
      const imageElement = image.image();
      const configuredFocalX = Number(item.config.focalX);
      const configuredFocalY = Number(item.config.focalY);
      const coverConfig = item.config.fit === 'cover'
        ? calculateCoverCrop(
            image.width(),
            image.height(),
            Number(item.config.width) || originalWidth,
            Number(item.config.height) || originalHeight,
            Number.isFinite(configuredFocalX) ? configuredFocalX : 0.5,
            Number.isFinite(configuredFocalY) ? configuredFocalY : 0.5,
          )
        : {};
      item.config = { ...item.config, ...coverConfig, image: imageElement };
      canvasItems.value = [...canvasItems.value];
    },
    () => {
      if (revision !== imageLoadRevision || props.readOnly) return;
      toast.error('The image could not be loaded.');
    },
  );
}

function calculateCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  focalX: number,
  focalY: number,
) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;

  if (sourceRatio > targetRatio) cropWidth = sourceHeight * targetRatio;
  else cropHeight = sourceWidth / targetRatio;

  const maxCropX = Math.max(0, sourceWidth - cropWidth);
  const maxCropY = Math.max(0, sourceHeight - cropHeight);
  return {
    crop: {
      x: Math.min(maxCropX, Math.max(0, maxCropX * focalX)),
      y: Math.min(maxCropY, Math.max(0, maxCropY * focalY)),
      width: cropWidth,
      height: cropHeight,
    },
    width: targetWidth,
    height: targetHeight,
  };
}

function disableDraggingWhenReadOnly(config: Record<string, any>) {
  return props.readOnly ? { ...config, draggable: false } : config;
}

function emitUpdate() {
  if (props.readOnly) return;
  const serializedChildren = canvasItems.value.map((item) => {
    const config = stripRuntimeImage(item.config);
    if (item.kind === 'group') {
      return {
        className: 'Group',
        attrs: config,
        children: [
          { className: 'Rect', attrs: item.rect },
          { className: 'Text', attrs: item.text },
        ],
      };
    }
    return { className: item.kind === 'image' ? 'Image' : 'Rect', attrs: config };
  });
  const json = JSON.stringify({
    className: 'Stage',
    attrs: {
      width: originalWidth,
      height: originalHeight,
      scaleX: 1,
      scaleY: 1,
      ...stageMetadata.value,
    },
    children: [{ className: 'Layer', children: serializedChildren }],
  });
  isInternalUpdate = true;
  emit('update:modelValue', json);
}

function stripRuntimeImage(config: Record<string, any>) {
  const { image: _image, ...serializable } = config;
  return serializable;
}

function addImageToCanvas(imageUrl: string) {
  const proxiedUrl = `/api/image-proxy/?url=${encodeURIComponent(imageUrl)}`;
  const key = `image-${Date.now()}`;
  const item: ImageCanvasItem = {
    kind: 'image',
    key,
    config: {
      id: key,
      name: key,
      src: proxiedUrl,
      x: 0,
      y: 0,
      width: originalWidth,
      height: originalHeight,
      fit: 'cover',
      focalX: 0.5,
      focalY: 0.5,
      draggable: true,
    },
  };
  const existingCoverIndex = props.visualOnly
    ? canvasItems.value.findIndex(candidate => candidate.kind === 'image')
    : -1;
  if (existingCoverIndex !== -1) {
    canvasItems.value.splice(existingCoverIndex, 1, item);
  } else {
    const firstForegroundIndex = canvasItems.value.findIndex(candidate => candidate.kind === 'group');
    if (firstForegroundIndex === -1) canvasItems.value.push(item);
    else canvasItems.value.splice(firstForegroundIndex, 0, item);
  }
  loadImage(item, imageLoadRevision);
  nextTick(emitUpdate);
  toast.success(existingCoverIndex === -1 ? 'Image added to canvas!' : 'Image updated!');
}

function addTextbox() {
  const key = `group-${Date.now()}`;
  const textConfig = {
    text: 'Votre texte ici',
    fontSize: 32,
    fontFamily: 'Inter, sans-serif',
    fill: hexToRgb('#000'),
    padding: 10,
    width: 300,
    wrap: 'word',
  };
  const text = new Konva.Text(textConfig);
  canvasItems.value.push({
    kind: 'group',
    key,
    config: { id: key, name: key, x: 50, y: 110, draggable: true },
    rect: { width: text.width(), height: text.height(), fill: hexToRgb('#fff'), cornerRadius: 10 },
    text: textConfig,
  });
  nextTick(emitUpdate);
}

function openBackgroundModal() {
  isBackgroundModalOpen.value = true;
}

function clearSlide() {
  canvasItems.value = [];
  selectedShapeName.value = '';
  updateTransformer();
  nextTick(emitUpdate);
  toast.info('Slide has been cleared.');
}

function deleteSelectedObject() {
  if (!selectedShapeName.value) return;
  const index = canvasItems.value.findIndex((item) => item.config.name === selectedShapeName.value);
  if (index === -1) return;
  canvasItems.value.splice(index, 1);
  selectedShapeName.value = '';
  updateTransformer();
  emit('select-element', null);
  nextTick(emitUpdate);
}

function handleStageMouseDown(event: any) {
  if (props.readOnly) return;
  if (event.target === event.target.getStage()) {
    selectedShapeName.value = '';
    updateTransformer();
    emit('select-element', null);
    return;
  }
  if (event.target.getParent()?.className === 'Transformer') return;

  let shape = event.target;
  if (shape.className === 'Text' || shape.className === 'Rect' && shape.getParent()?.className === 'Group') {
    shape = shape.getParent();
  }
  const name = shape.name();
  if (!name) return;
  const item = canvasItems.value.find(candidate => candidate.config.name === name);
  if (props.visualOnly && item?.kind !== 'image') return;
  selectedShapeName.value = name;
  updateTransformer();
  emit('select-element', item?.kind === 'group'
    ? { ...item.config, rect: item.rect, text: item.text }
    : item?.config || null);
}

function updateTransformer() {
  const transformer = transformerRef.value?.getNode?.();
  const stage = stageRef.value?.getNode?.();
  if (!transformer || !stage) return;
  const selectedNode = selectedShapeName.value ? stage.findOne(`.${selectedShapeName.value}`) : null;
  transformer.nodes(selectedNode ? [selectedNode] : []);
}

function handleDragEnd(event: any) {
  const item = findItemByName(event.target.name());
  if (!item) return;
  item.config.x = event.target.x();
  item.config.y = event.target.y();
  emitUpdate();
}

function handleTransformEnd(event: any) {
  const item = findItemByName(event.target.name());
  if (!item) return;
  item.config.x = event.target.x();
  item.config.y = event.target.y();
  item.config.scaleX = event.target.scaleX();
  item.config.scaleY = event.target.scaleY();
  item.config.rotation = event.target.rotation();
  emitUpdate();
}

function findItemByName(name: string) {
  return canvasItems.value.find((item) => item.config.name === name);
}

function handleDblClick(event: any) {
  if (props.readOnly || event.target.className !== 'Text') return;
  const group = event.target.getParent();
  const textNode = event.target;
  const item = findItemByName(group.name());
  if (!item || item.kind !== 'group') return;

  group.hide();
  transformerRef.value?.getNode()?.hide();
  const stageBox = stageRef.value.getNode().container().getBoundingClientRect();
  const scale = stageRef.value.getNode().scaleX();
  const position = group.absolutePosition();
  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  textarea.value = textNode.text();
  Object.assign(textarea.style, {
    position: 'absolute',
    top: `${stageBox.top + position.y}px`,
    left: `${stageBox.left + position.x}px`,
    width: `${textNode.width() * scale}px`,
    minHeight: `${textNode.height() * scale}px`,
    border: 'none',
    padding: `${textNode.padding() * scale}px`,
    margin: '0',
    overflow: 'hidden',
    background: '#fff',
    borderRadius: '10px',
    outline: 'none',
    resize: 'none',
    lineHeight: String(textNode.lineHeight()),
    fontFamily: textNode.fontFamily(),
    textAlign: textNode.align(),
    color: textNode.fill(),
    fontSize: `${textNode.fontSize() * scale}px`,
    transformOrigin: 'left top',
  });
  textarea.focus();

  const close = (save: boolean) => {
    if (save) {
      item.text.text = textarea.value;
      const measuredText = new Konva.Text(item.text);
      item.rect.width = measuredText.width();
      item.rect.height = measuredText.height();
      emitUpdate();
    }
    textarea.remove();
    window.removeEventListener('pointerdown', outsideClick);
    group.show();
    transformerRef.value?.getNode()?.show();
    transformerRef.value?.getNode()?.forceUpdate();
  };
  const outsideClick = (pointerEvent: PointerEvent) => {
    if (pointerEvent.target !== textarea) close(true);
  };
  textarea.addEventListener('keydown', (keyboardEvent) => {
    if (keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) {
      keyboardEvent.preventDefault();
      close(true);
    } else if (keyboardEvent.key === 'Escape') close(false);
  });
  setTimeout(() => window.addEventListener('pointerdown', outsideClick));
}

defineExpose({ redraw: scaleAndPositionCanvas });
</script>
