<template>
  <div class="quick-actions-bar" @click.stop>
    <button
      v-if="showApprove"
      class="action-btn approve"
      :disabled="loading"
      @click="$emit('approve')"
      title="Approve PR"
    >
      <Check :size="16" :stroke-width="2.5" />
    </button>

    <button
      v-if="showRequestChanges"
      class="action-btn request-changes"
      :disabled="loading"
      @click="$emit('request-changes')"
      title="Request Changes"
    >
      <X :size="16" :stroke-width="2.5" />
    </button>

    <button
      v-if="showComment"
      class="action-btn comment"
      :disabled="loading"
      @click="$emit('comment')"
      title="Add Comment"
    >
      <MessageSquare :size="15" :stroke-width="2" />
    </button>

    <span v-if="loading" class="loading-indicator"></span>
  </div>
</template>

<script setup lang="ts">
import { Check, X, MessageSquare } from 'lucide-vue-next';

interface Props {
  showApprove?: boolean;
  showRequestChanges?: boolean;
  showComment?: boolean;
  loading?: boolean;
}

withDefaults(defineProps<Props>(), {
  showApprove: true,
  showRequestChanges: true,
  showComment: true,
  loading: false,
});

defineEmits<{
  (e: 'approve'): void;
  (e: 'request-changes'): void;
  (e: 'comment'): void;
}>();
</script>

<style scoped>
.quick-actions-bar {
  display: flex;
  gap: 4px;
  align-items: center;
  opacity: 0;
  transition: opacity var(--transition-fast);
  pointer-events: none;
}

.quick-actions-bar.visible,
.pr-card:hover .quick-actions-bar {
  opacity: 1;
  pointer-events: auto;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: 12px;
}

.action-btn:hover:not(:disabled) {
  transform: scale(1.05);
}

.action-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn.approve {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.action-btn.approve:hover:not(:disabled) {
  background: var(--color-success);
  color: white;
}

.action-btn.request-changes {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.action-btn.request-changes:hover:not(:disabled) {
  background: var(--color-error);
  color: white;
}

.action-btn.comment {
  background: var(--color-accent-light);
  color: var(--color-accent-primary);
}

.action-btn.comment:hover:not(:disabled) {
  background: var(--color-accent-primary);
  color: white;
}


.loading-indicator {
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-surface-secondary);
  border-top-color: var(--color-accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-left: 4px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
