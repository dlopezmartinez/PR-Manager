<template>
  <span
    :class="[
      'app-badge',
      `app-badge--${variant}`,
      `app-badge--${size}`,
      {
        'app-badge--pill': pill,
        'app-badge--uppercase': uppercase,
      }
    ]"
  >
    <slot />
  </span>
</template>

<script setup lang="ts">
interface Props {
  variant?:
    | 'success'
    | 'warning'
    | 'error'
    | 'info'
    | 'neutral'
    | 'pr-open'
    | 'pr-merged'
    | 'pr-closed'
    | 'pr-draft'
    | 'author'
    | 'comment'
    | 'review'
    | 'merge';
  size?: 'xs' | 'sm' | 'md';
  pill?: boolean;
  uppercase?: boolean;
}

withDefaults(defineProps<Props>(), {
  variant: 'neutral',
  size: 'sm',
  pill: false,
  uppercase: false,
});
</script>

<style scoped>
.app-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  border-radius: var(--radius-sm);
}

/* Sizes */
.app-badge--xs {
  padding: 1px 6px;
  font-size: 10px;
}

.app-badge--sm {
  padding: 2px 8px;
  font-size: 11px;
}

.app-badge--md {
  padding: var(--spacing-xs) 10px;
  font-size: 12px;
}

/* Modifiers */
.app-badge--pill {
  border-radius: var(--radius-full);
}

.app-badge--uppercase {
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Semantic Variants */
.app-badge--success {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.app-badge--warning {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.app-badge--error {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.app-badge--info {
  background: var(--color-info-bg);
  color: var(--color-info);
}

.app-badge--neutral {
  background: var(--color-surface-secondary);
  color: var(--color-text-secondary);
}

/* PR Status Variants */
.app-badge--pr-open {
  background: var(--color-success-bg);
  color: var(--color-pr-open);
}

.app-badge--pr-merged {
  background: var(--color-pr-merged-bg);
  color: var(--color-pr-merged);
}

.app-badge--pr-closed {
  background: var(--color-error-bg);
  color: var(--color-pr-closed);
}

.app-badge--pr-draft {
  background: var(--color-surface-secondary);
  color: var(--color-pr-draft);
}

/* Author Badge */
.app-badge--author {
  background: var(--color-author-bg);
  color: var(--color-author);
}

/* Notification Type Variants */
.app-badge--comment {
  background: var(--color-notification-comment-bg);
  color: var(--color-notification-comment);
}

.app-badge--review {
  background: var(--color-notification-review-bg);
  color: var(--color-notification-review);
}

.app-badge--merge {
  background: var(--color-notification-merge-bg);
  color: var(--color-notification-merge);
}
</style>
