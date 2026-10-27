<template>
  <div class="relative">
    <input
      :id="id"
      v-model="password"
      :type="visible ? 'text' : 'password'"
      name="password"
      :autocomplete="autocomplete"
      :minlength="minlength"
      :required="required"
      :disabled="disabled"
      :aria-describedby="describedBy"
      :placeholder="placeholder"
      autocapitalize="off"
      :spellcheck="false"
      class="h-12 w-full rounded-xl border border-border bg-muted/20 py-2 pl-4 pr-12 text-base text-foreground shadow-none transition placeholder:text-muted-foreground focus:border-violet-400/70 focus:outline-none focus:ring-4 focus:ring-violet-400/10 disabled:cursor-not-allowed disabled:opacity-50"
    />
    <button
      type="button"
      :aria-label="visible ? 'Hide password' : 'Show password'"
      :aria-controls="id"
      :disabled="disabled"
      class="absolute right-1 top-1 flex size-10 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
      @click="visible = !visible"
    >
      <EyeOff v-if="visible" class="size-4" aria-hidden="true" />
      <Eye v-else class="size-4" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { Eye, EyeOff } from 'lucide-vue-next';

withDefaults(defineProps<{
  id: string;
  autocomplete: 'current-password' | 'new-password';
  minlength?: number;
  describedBy?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}>(), {
  minlength: undefined,
  describedBy: undefined,
  disabled: false,
  required: true,
  placeholder: 'Enter your password',
});

const password = defineModel<string>({ default: '' });
const visible = ref(false);
</script>
