<template>
  <div class='w-full flex justify-center'>
    <div class='px-4 flex flex-col items-end gap-4'>
      <button class='py-2 px-4 bg-blue-600 hover:bg-blue-500 transition shadow rounded-full flex items-center gap-2'
              @click='addText'>
        <span>
          <PlusCircleIcon class='h-5 w-5' />
        </span>
        Add text
      </button>
      <button class='py-2 px-4 bg-blue-600 hover:bg-blue-500 transition shadow rounded-full flex items-center gap-2'
              @click='openBackgroundModal'>
        <span>
          <PhotoIcon class='h-5 w-5' />
        </span>
        Choose background
      </button>
    </div>
    <div class='w-[390px] h-[844px] bg-white/70 rounded-xl overflow-hidden shadow outline outline-2'>
      <canvas ref='canvasRef' height='844' width='390'></canvas>
    </div>
    <div class='px-4'>
      <button
        class='opacity-0 py-2 px-4 bg-blue-600 hover:bg-blue-500 transition shadow rounded-full flex items-center gap-2'>
        <span>
          <PhotoIcon class='h-5 w-5' />
        </span>
        Choose background
      </button>
    </div>
    <RecapBackgroundModal v-model:is-open='isBackgroundModalOpen' />
  </div>
</template>

<script lang='ts' setup>
import { ref } from 'vue';
import { fabric } from 'fabric';
import type { Canvas } from 'fabric/fabric-impl';
import { PhotoIcon, PlusCircleIcon } from '@heroicons/vue/24/outline';

const props = defineProps({
  image: {
    type: String,
    required: true
  }
});

const isBackgroundModalOpen = ref(false);

const canvasRef = ref(null);
let canvas: Canvas | null = null;

onMounted(() => {
  canvas = new fabric.Canvas(canvasRef.value);

  fabric.Image.fromURL(props.image, function(oImg) {
    if (!canvas) return;
    oImg.scale(0.5);
    canvas.add(oImg);
  });
});

const deleteIcon = 'data:image/svg+xml,%3C%3Fxml version=\'1.0\' encoding=\'utf-8\'%3F%3E%3C!DOCTYPE svg PUBLIC \'-//W3C//DTD SVG 1.1//EN\' \'http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\'%3E%3Csvg version=\'1.1\' id=\'Ebene_1\' xmlns=\'http://www.w3.org/2000/svg\' xmlns:xlink=\'http://www.w3.org/1999/xlink\' x=\'0px\' y=\'0px\' width=\'595.275px\' height=\'595.275px\' viewBox=\'200 215 230 470\' xml:space=\'preserve\'%3E%3Ccircle style=\'fill:%23F44336;\' cx=\'299.76\' cy=\'439.067\' r=\'218.516\'/%3E%3Cg%3E%3Crect x=\'267.162\' y=\'307.978\' transform=\'matrix(0.7071 -0.7071 0.7071 0.7071 -222.6202 340.6915)\' style=\'fill:white;\' width=\'65.545\' height=\'262.18\'/%3E%3Crect x=\'266.988\' y=\'308.153\' transform=\'matrix(0.7071 0.7071 -0.7071 0.7071 398.3889 -83.3116)\' style=\'fill:white;\' width=\'65.544\' height=\'262.179\'/%3E%3C/g%3E%3C/svg%3E';
const img = document.createElement('img');
img.src = deleteIcon;

const addText = () => {
  if (!canvas) return;

  const text = new fabric.IText('Text', { left: 100, top: 100 });
  canvas.add(text);
  canvas.setActiveObject(text);
};

function deleteObject(eventData, transform) {
  const target = transform.target;
  const canvas = target.canvas;
  canvas.remove(target);
  canvas.requestRenderAll();
}

function renderIcon(ctx, left, top, styleOverride, fabricObject) {
  const size = this.cornerSize;
  ctx.save();
  ctx.translate(left, top);
  ctx.rotate(fabric.util.degreesToRadians(fabricObject.angle));
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

fabric.Object.prototype.controls.deleteControl = new fabric.Control({
  x: 0.5,
  y: -0.5,
  offsetY: 16,
  cursorStyle: 'pointer',
  mouseUpHandler: deleteObject,
  render: renderIcon,
  cornerSize: 24
});

const openBackgroundModal = () => {
  isBackgroundModalOpen.value = true;
};

</script>
