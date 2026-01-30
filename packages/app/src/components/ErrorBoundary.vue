<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue';
import { uiLogger } from '../utils/logger';

interface Props {
  fallbackMessage?: string;
}

const props = withDefaults(defineProps<Props>(), {
  fallbackMessage: 'Something went wrong',
});

const emit = defineEmits<{
  (e: 'error', error: Error, info: string): void;
}>();

const error = ref<Error | null>(null);
const errorInfo = ref<string>('');

onErrorCaptured((err: Error, instance, info: string) => {
  error.value = err;
  errorInfo.value = info;

  emit('error', err, info);

  uiLogger.error('ErrorBoundary caught error', { error: err.message, stack: err.stack, componentInfo: info });

  return false;
});

function resetError() {
  error.value = null;
  errorInfo.value = '';
}
</script>

<template>
  <div v-if="error" class="error-boundary">
    <div class="error-content">
      <div class="error-icon">!</div>
      <h3 class="error-title">{{ props.fallbackMessage }}</h3>
      <p class="error-message">{{ error.message }}</p>
      <button class="retry-button" @click="resetError">
        Try Again
      </button>
      <details class="error-details">
        <summary>Technical Details</summary>
        <pre>{{ error.stack }}</pre>
        <p><strong>Component:</strong> {{ errorInfo }}</p>
      </details>
    </div>
  </div>
  <slot v-else />
</template>

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  min-height: 100px;
  height: 100%;
  overflow: auto;
}

.error-content {
  text-align: center;
  max-width: 95%;
  width: 100%;
  user-select: text;
  -webkit-user-select: text;
}

.error-icon {
  width: 36px;
  height: 36px;
  margin: 0 auto 10px;
  background: var(--color-danger, #dc3545);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
}

.error-title {
  margin: 0 0 6px;
  font-size: 16px;
  color: var(--color-text, #333);
}

.error-message {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--color-text-secondary, #666);
  word-break: break-word;
  user-select: text;
  -webkit-user-select: text;
}

.retry-button {
  padding: 6px 14px;
  background: var(--color-primary, #0066cc);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.retry-button:hover {
  background: var(--color-primary-hover, #0052a3);
}

.error-details {
  margin-top: 12px;
  text-align: left;
  font-size: 11px;
  color: var(--color-text-secondary, #666);
}

.error-details summary {
  cursor: pointer;
  margin-bottom: 6px;
  font-weight: 500;
}

.error-details pre {
  background: var(--color-bg-secondary, #f5f5f5);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 10px;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
  -webkit-user-select: text;
}

.error-details p {
  margin: 6px 0 0;
  user-select: text;
  -webkit-user-select: text;
}
</style>
