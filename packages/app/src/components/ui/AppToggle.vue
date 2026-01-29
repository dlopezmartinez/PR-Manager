<template>
  <label
    :class="[
      'app-toggle',
      `app-toggle--${size}`,
      { 'app-toggle--disabled': disabled }
    ]"
  >
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="handleChange"
    />
    <span class="app-toggle__slider"></span>
  </label>
</template>

<script setup lang="ts">
interface Props {
  modelValue: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  size: 'md',
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

function handleChange(event: Event) {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.checked);
}
</script>

<style scoped>
.app-toggle {
  position: relative;
  display: inline-block;
  cursor: pointer;
}

.app-toggle--disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.app-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.app-toggle__slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--color-surface-secondary);
  transition: 0.3s;
  border-radius: 9999px;
}

.app-toggle__slider:before {
  position: absolute;
  content: "";
  background: var(--color-bg-elevated);
  transition: 0.3s;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.app-toggle input:checked + .app-toggle__slider {
  background: var(--color-success);
}

.app-toggle--disabled .app-toggle__slider {
  cursor: not-allowed;
}

/* Size: md (default) */
.app-toggle--md {
  width: 40px;
  height: 24px;
}

.app-toggle--md .app-toggle__slider:before {
  height: 20px;
  width: 20px;
  left: 2px;
  bottom: 2px;
}

.app-toggle--md input:checked + .app-toggle__slider:before {
  transform: translateX(16px);
}

/* Size: sm */
.app-toggle--sm {
  width: 32px;
  height: 18px;
}

.app-toggle--sm .app-toggle__slider:before {
  height: 14px;
  width: 14px;
  left: 2px;
  bottom: 2px;
}

.app-toggle--sm input:checked + .app-toggle__slider:before {
  transform: translateX(14px);
}
</style>
