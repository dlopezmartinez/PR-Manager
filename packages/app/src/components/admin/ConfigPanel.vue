<template>
  <div class="panel">
    <header class="panel-header">
      <h2>System Configuration</h2>
      <p class="panel-description">Manage system-wide settings</p>
    </header>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
    </div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button @click="loadConfig" class="retry-btn">Retry</button>
    </div>

    <div v-else class="config-list">
      <div v-if="configs.length === 0" class="empty-state">
        <p>No configuration keys found</p>
      </div>

      <div v-for="config in configs" :key="config.id" class="config-item">
        <div class="config-key">
          <code>{{ config.key }}</code>
        </div>
        <div class="config-value">
          <pre>{{ JSON.stringify(config.value, null, 2) }}</pre>
        </div>
        <div class="config-actions">
          <button @click="deleteConfig(config.key)" class="action-btn delete">
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminService } from '../../services/adminService.js';
import type { SystemConfig } from '../../types/admin.js';

const loading = ref(false);
const error = ref<string | null>(null);
const configs = ref<SystemConfig[]>([]);

async function loadConfig() {
  loading.value = true;
  error.value = null;
  try {
    const response = await adminService.getConfig();
    configs.value = response.configs || [];
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load config';
  } finally {
    loading.value = false;
  }
}

async function deleteConfig(key: string) {
  if (!confirm(`Delete configuration key "${key}"?`)) return;
  try {
    await adminService.deleteConfig(key);
    await loadConfig();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete config';
  }
}

onMounted(() => {
  loadConfig();
});
</script>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  height: 100%;
}

.panel-header {
  flex-shrink: 0;
}

.panel-header h2 {
  margin: 0 0 var(--spacing-xs) 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.panel-description {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.loading-state,
.error-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  min-height: 200px;
  flex-direction: column;
  color: var(--color-text-secondary);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-state {
  background: var(--color-error-bg);
  color: var(--color-error);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
}

.retry-btn {
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-error);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
}

.config-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--color-text-secondary);
}

.config-item {
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
}

.config-key {
  margin-bottom: var(--spacing-sm);
}

.config-key code {
  background: var(--color-bg-primary);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--color-accent);
}

.config-value {
  margin-bottom: var(--spacing-sm);
}

.config-value pre {
  margin: 0;
  background: var(--color-bg-primary);
  padding: var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: 12px;
  overflow-x: auto;
  color: var(--color-text-primary);
  max-height: 200px;
  overflow-y: auto;
}

.config-actions {
  display: flex;
  gap: var(--spacing-xs);
}

.action-btn {
  padding: 4px 8px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 11px;
}

.action-btn.delete {
  background: var(--color-error);
}

.action-btn:hover {
  opacity: 0.9;
}
</style>
