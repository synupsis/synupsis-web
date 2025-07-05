<template>
  <aside class="w-80 p-4 border-l border-border flex flex-col gap-4 overflow-y-auto">
    <h2 class="text-xl font-semibold tracking-tight">Inspector</h2>
    <div v-if="selectedElement" class="space-y-4">
      <div>
        <label class="text-sm font-medium">Text Content</label>
        <textarea
          :value="selectedElement.text.text"
          @input="updateText($event.target.value)"
          class="w-full p-2 rounded-md bg-muted border border-border"
          rows="4"
        />
      </div>
      <div>
        <label class="text-sm font-medium">Font Size</label>
        <input
          type="number"
          :value="selectedElement.text.fontSize"
          @input="update('fontSize', parseInt($event.target.value))"
          class="w-full p-2 rounded-md bg-muted border border-border"
        />
      </div>
      <div>
        <label class="text-sm font-medium">Fill Color</label>
        <input
          type="color"
          :value="selectedElement.text.fill"
          @input="update('fill', $event.target.value)"
          class="w-full p-2 rounded-md bg-muted border border-border"
        />
      </div>
      <div>
        <label class="text-sm font-medium">Position</label>
        <div class="flex gap-2">
          <div class="flex-1">
            <label class="text-xs">X</label>
            <input
              type="number"
              :value="selectedElement.x"
              @input="update('x', parseInt($event.target.value))"
              class="w-full p-2 rounded-md bg-muted border border-border"
            />
          </div>
          <div class="flex-1">
            <label class="text-xs">Y</label>
            <input
              type="number"
              :value="selectedElement.y"
              @input="update('y', parseInt($event.target.value))"
              class="w-full p-2 rounded-md bg-muted border border-border"
            />
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-muted-foreground text-sm text-center mt-8">
      Select an element on the canvas to edit its properties.
    </div>
  </aside>
</template>

<script setup lang="ts">
const props = defineProps<{
  selectedElement: any;
}>();

const emit = defineEmits(['update']);

const update = (key: string, value: any) => {
  const newAttrs = { ...props.selectedElement };
  if (['fontSize', 'fill'].includes(key)) {
    newAttrs.text = { ...newAttrs.text, [key]: value };
  } else {
    newAttrs[key] = value;
  }
  emit('update', newAttrs);
};

const updateText = (newText: string) => {
  const newAttrs = {
    ...props.selectedElement,
    text: {
      ...props.selectedElement.text,
      text: newText,
    },
  };
  emit('update', newAttrs);
};
</script>
