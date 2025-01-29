<template>
  <div>
    <router-link v-if="type === 'link' && to" :to="to">
      <slot></slot>
    </router-link>
    <a v-else-if="type === 'link' && href" :href="href">
      <slot></slot>
    </a>
    <button v-else :disabled="disabled" class="btn">
      <slot></slot>
    </button>
  </div>
</template>

<script lang="ts" setup>
defineProps({
  type: {
    type: String,
    default: 'default'
  },
  href: {
    type: String,
    default: ''
  },
  to: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  }
});
</script>
