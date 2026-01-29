<template>
  <button
    :class="[
      'app-btn',
      `app-btn--${variant}`,
      `app-btn--${size}`,
      {
        'app-btn--full-width': fullWidth,
        'app-btn--loading': loading,
      }
    ]"
    :disabled="disabled || loading"
    v-bind="$attrs"
  >
    <span v-if="loading" class="app-btn__spinner"></span>
    <slot v-else />
  </button>
</template>

<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'secondary' | 'danger' | 'text';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  fullWidth: false,
});
</script>

<style scoped>
.app-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  border-radius: var(--radius-md);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  border: none;
  white-space: nowrap;
}

.app-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Sizes */
.app-btn--sm {
  padding: 6px 12px;
  font-size: 12px;
  min-height: 28px;
}

.app-btn--md {
  padding: 8px 16px;
  font-size: 13px;
  min-height: 36px;
}

.app-btn--lg {
  padding: 10px 20px;
  font-size: 14px;
  min-height: 44px;
}

/* Variants */
.app-btn--primary {
  background: var(--color-accent-primary);
  color: var(--color-text-inverted);
}

.app-btn--primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.app-btn--secondary {
  background: var(--color-surface-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-secondary);
}

.app-btn--secondary:hover:not(:disabled) {
  background: var(--color-surface-hover);
  border-color: var(--color-border-primary);
}

.app-btn--danger {
  background: var(--color-error);
  color: var(--color-text-inverted);
}

.app-btn--danger:hover:not(:disabled) {
  opacity: 0.9;
}

.app-btn--text {
  background: transparent;
  color: var(--color-accent-primary);
  padding-left: var(--spacing-sm);
  padding-right: var(--spacing-sm);
}

.app-btn--text:hover:not(:disabled) {
  background: var(--color-surface-hover);
}

/* Modifiers */
.app-btn--full-width {
  width: 100%;
}

.app-btn--loading {
  cursor: wait;
}

/* Spinner */
.app-btn__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: app-btn-spin 0.8s linear infinite;
}

@keyframes app-btn-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
