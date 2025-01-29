<template>
  <div>
    <input :name="name" class="checkbox" type="checkbox" />
  </div>
</template>

<script lang="ts" setup>
defineProps({
  name: {
    type: String,
    required: true
  }
});
</script>
