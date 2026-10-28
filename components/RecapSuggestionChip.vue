<template>
  <!-- Follows a text that has suggestions; the slide's owner opens their list (see data-chip-path). -->
  <button
    v-if="count"
    type="button"
    class="recap-suggestion-chip"
    :data-chip-path="path"
    :aria-label="count > 1 ? t('{count} suggestions on this text', { count }) : t('{count} suggestion on this text', { count })"
  >
    <MessageSquareMoreIcon class="h-3 w-3" :stroke-width="2.5" aria-hidden="true" />
    <span aria-hidden="true">{{ count }}</span>
  </button>
</template>

<script setup lang="ts">
import { MessageSquareMoreIcon } from 'lucide-vue-next';

const { t } = useI18n();

defineProps<{
  path: string;
  count: number;
}>();
</script>

<style scoped>
/* The same size whatever the text it follows. */
.recap-suggestion-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  margin-left: 6px;
  padding: 0 7px 0 6px;
  border-radius: 999px;
  vertical-align: middle;
  background: rgb(251 191 36);
  box-shadow: 0 2px 10px rgb(0 0 0 / 0.35);
  color: #1c1917;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: transform 150ms, background-color 150ms;
}
.recap-suggestion-chip:hover { background: rgb(252 211 77); transform: scale(1.06); }
.recap-suggestion-chip:focus-visible { outline: 2px solid white; outline-offset: 2px; }
</style>
