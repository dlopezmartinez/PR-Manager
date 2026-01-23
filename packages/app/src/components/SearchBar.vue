<template>
  <div class="search-bar" :class="{ focused: isFocused, 'has-value': modelValue }">
    <Search :size="14" :stroke-width="2" class="search-icon" />
    <input
      ref="inputRef"
      type="text"
      :value="modelValue"
      @input="handleInput"
      @focus="isFocused = true"
      @blur="isFocused = false"
      @keydown.esc="handleClear"
      :placeholder="placeholder"
      class="search-input"
    />
    <button
      v-if="modelValue"
      class="clear-btn"
      @click="handleClear"
      title="Clear search"
    >
      <X :size="12" :stroke-width="2" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Search, X } from 'lucide-vue-next';

interface Props {
  modelValue: string;
  placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Filter PRs...',
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const isFocused = ref(false);

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.value);
}

function handleClear() {
  emit('update:modelValue', '');
  inputRef.value?.blur();
}

defineExpose({
  focus: () => inputRef.value?.focus(),
});
</script>

<style scoped>
.search-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  background: var(--color-surface-primary);
  border: 1.5px solid var(--color-border-secondary);
  border-radius: 10px;
  padding: 7px 14px;
  transition: all var(--transition-fast);
  min-width: 200px;
}

.search-bar:hover {
  border-color: var(--color-border-primary);
}

.search-bar.focused {
  background: var(--color-bg-elevated);
  border-color: var(--color-accent-primary);
  box-shadow: 0 0 0 4px var(--color-accent-light);
}

.search-icon {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.search-bar.focused .search-icon,
.search-bar.has-value .search-icon {
  color: var(--color-text-secondary);
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13px;
  font-family: var(--font-family);
  color: var(--color-text-primary);
  outline: none;
  min-width: 0;
}

.search-input::placeholder {
  color: var(--color-text-tertiary);
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: var(--color-surface-secondary);
  border-radius: var(--radius-full);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.clear-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.clear-btn svg {
  flex-shrink: 0;
}
</style>
